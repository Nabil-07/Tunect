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
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async completePastSessions() {
    const now = new Date();
    const updated = await this.prisma.booking.updateMany({
      where: {
        status: BookingStatus.CONFIRMED,
        endTime: { not: null, lt: now }, // only complete if endTime exists
      },
      data: { status: BookingStatus.COMPLETED },
    });
    if (updated.count > 0) {
      this.logger.log(`Auto-completed ${updated.count} finished sessions.`);
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
