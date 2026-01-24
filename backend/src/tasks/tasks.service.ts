import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';
import { fromUtc } from '../common/time.util';
import { addMinutes } from 'date-fns';
import { BookingStatus } from '@prisma/client';

// Config: how many minutes before session we remind
const REMIND_BEFORE_MIN = 30;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: NotifierService,
  ) {}

  private platformFeePercent(hourlyRate?: number | null): number {
    const defaultFee = Number(process.env.FEE_PERCENT ?? 20);
    const rate = Number(hourlyRate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return defaultFee;
    if (rate < 400) return 25;
    if (rate < 700) return 18;
    return 15;
  }

  // 1) Every minute: send reminders for sessions starting within next 30 minutes
  @Interval(60 * 1000)
  async sendUpcomingSessionReminders() {
    const now = new Date();
    const windowStart = now;
    const windowEnd = addMinutes(now, REMIND_BEFORE_MIN);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: windowStart, lte: windowEnd }, // all UTC in DB
      },
      include: {
        tutor: { include: { user: true } },
        student: { include: { user: true } },
      },
    });

    for (const b of bookings) {
      if (!b.startTime) continue; // skip unscheduled demos

      const tutorTz = (b.tutor as any).timeZone || 'UTC';
      const studentTz = (b.student as any).timeZone || 'UTC';

      const tutorLocal = fromUtc(b.startTime, tutorTz).iso;
      const studentLocal = fromUtc(b.startTime, studentTz).iso;

      // Avoid duplicate reminders: mark a flag in DB
      const already = await this.prisma.reminder.findFirst({
        where: { bookingId: b.id, kind: 'T30' },
      });
      if (already) continue;

      await this.notifier.sendBookingReminder({
        to: b.tutor.user.email,
        role: 'TUTOR',
        bookingId: b.id,
        startLocalISO: tutorLocal,
      });
      await this.notifier.sendBookingReminder({
        to: b.student.user.email,
        role: 'STUDENT',
        bookingId: b.id,
        startLocalISO: studentLocal,
      });

      await this.prisma.reminder.create({
        data: { bookingId: b.id, kind: 'T30', sentAt: new Date() },
      });
    }
  }

  // 2) Nightly cleanup at 02:00 UTC: auto-complete past sessions
  // Only auto-complete sessions where attendance is verified (whiteboard session exists)
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async completePastSessions() {
    const now = new Date();
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        endTime: { not: null, lt: now },
      },
      select: {
        id: true,
        isDemo: true,
        tokensCharged: true,
        tutorId: true,
        tutor: { select: { hourlyRate: true } },
      },
    });

    let completedCount = 0;
    let skippedNoAttendance = 0;

    for (const booking of bookings) {
      try {
        // Check for attendance evidence: whiteboardSession exists (indicates LiveKit participation)
        // Note: whiteboardSession is created when student requests LiveKit token (joins class)
        // This tracks actual LiveKit room participation, not just whiteboard usage
        const whiteboardSession = await this.prisma.whiteboardSession.findUnique({
          where: { bookingId: booking.id },
          select: { id: true, data: true },
        });

        // Only auto-complete if there's evidence of attendance (student joined LiveKit room)
        // This ensures sessions aren't marked complete if student never joined the class
        if (!whiteboardSession || !whiteboardSession.data) {
          skippedNoAttendance++;
          this.logger.debug(`Skipping auto-complete for booking ${booking.id}: no attendance evidence (student didn't join LiveKit room)`);
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.booking.findUnique({
            where: { id: booking.id },
            select: {
              id: true,
              status: true,
              isDemo: true,
              tokensCharged: true,
              tutorId: true,
              tutor: { select: { hourlyRate: true } },
            },
          });

          if (!fresh || fresh.status !== BookingStatus.CONFIRMED) return;

          await tx.booking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.COMPLETED },
          });

          if (!fresh.isDemo && Number(fresh.tokensCharged) > 0) {
            const tokens = Number(fresh.tokensCharged);
            const feePercent = this.platformFeePercent(fresh.tutor?.hourlyRate ?? null);
            const tutorShare = Math.max(0, (tokens * (100 - feePercent)) / 100);

            await tx.tutorWallet.upsert({
              where: { tutorId: fresh.tutorId },
              update: { balance: { increment: tutorShare } },
              create: { tutorId: fresh.tutorId, balance: tutorShare },
            });

            await tx.tutorWalletLedger.create({
              data: {
                tutorId: fresh.tutorId,
                bookingId: fresh.id,
                delta: tutorShare,
                reason: 'BOOKING_EARNED',
                note: `Auto-complete share for booking ${fresh.id}`,
              },
            });
          }
        });
        completedCount += 1;
      } catch (error) {
        this.logger.warn(`Failed to auto-complete booking ${booking.id}: ${error}`);
      }
    }

    if (completedCount > 0) {
      this.logger.log(`Auto-completed ${completedCount} finished sessions with verified attendance.`);
    }
    if (skippedNoAttendance > 0) {
      this.logger.log(`Skipped ${skippedNoAttendance} sessions without attendance evidence (not auto-completed).`);
    }
  }

  // 3) Optional: guard against bad data every hour
  @Cron(CronExpression.EVERY_HOUR)
  async sanityCheck() {
    // Heuristic: sessions that claim to start in future but end in the past (impossible)
    const now = new Date();
    const bad = await this.prisma.booking.count({
      where: {
        startTime: { not: null, gte: now },
        endTime: { not: null, lt: now },
      },
    });
    if (bad > 0) this.logger.warn(`Found ${bad} bookings with inconsistent times (check input).`);
  }
}
