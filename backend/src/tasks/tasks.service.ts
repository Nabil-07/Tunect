import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';
import { AvailabilityTrackingService } from '../availability/availability-tracking.service';
import { fromUtc } from '../common/time.util';
import { addMinutes } from 'date-fns';
import { BookingStatus, Prisma, TokenReason } from '@prisma/client';

// Config: how many minutes before session we remind
const REMIND_BEFORE_MIN = 30;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: NotifierService,
    private availabilityTracking: AvailabilityTrackingService,
  ) {}

  private platformFeePercent(hourlyRate?: number | null): number {
    const rate = Number(hourlyRate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 20; // Default fallback
    // Commission rates: 0-399=25%, 400-699=22%, 700+=18%
    if (rate < 400) return 25;
    if (rate < 700) return 22;
    return 18;
  }

  private parseAttendance(data: any): { studentJoinedAt?: string; tutorJoinedAt?: string; startedAt?: string } {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const att = (data as any).attendance;
      if (att && typeof att === 'object') {
        return {
          studentJoinedAt: (att as any).studentJoinedAt,
          tutorJoinedAt: (att as any).tutorJoinedAt,
          startedAt: (att as any).startedAt,
        };
      }
    }
    return {};
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
  // Only auto-complete sessions where both tutor and student attendance are verified
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
        // Check for attendance evidence from whiteboard session attendance payload
        const whiteboardSession = await this.prisma.whiteboardSession.findUnique({
          where: { bookingId: booking.id },
          select: { id: true, data: true },
        });

        const attendance = this.parseAttendance(whiteboardSession?.data);
        const hasVerifiedAttendance = !!attendance.studentJoinedAt && !!attendance.tutorJoinedAt;

        if (!hasVerifiedAttendance) {
          skippedNoAttendance++;
          this.logger.debug(`Skipping auto-complete for booking ${booking.id}: attendance not verified for both participants`);
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
              startTime: true,
              endTime: true,
              tutorId: true,
              tutor: { select: { hourlyRate: true } },
            },
          });

          if (!fresh || fresh.status !== BookingStatus.CONFIRMED) return;

          await tx.booking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.COMPLETED },
          });

          if (!fresh.isDemo) {
            const hourlyRate = Number(fresh.tutor?.hourlyRate ?? 0);
            const hours = fresh.startTime && fresh.endTime
              ? Math.max(0, (fresh.endTime.getTime() - fresh.startTime.getTime()) / 3_600_000)
              : Number(fresh.tokensCharged || 0);
            if (!hours) return;
            const bookingAmount = hours * hourlyRate; // Total amount for the booking
            
            const feePercent = this.platformFeePercent(hourlyRate);
            const tutorShare = Math.max(0, (bookingAmount * (100 - feePercent)) / 100);

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

  // 2.5) Every minute: auto-handle no-show after 10 minutes from start
  @Interval(60 * 1000)
  async handleNoShowBookings() {
    const now = new Date();
    const cutoff = addMinutes(now, -10);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.WAITING_ROOM] },
        startTime: { not: null, lte: cutoff },
        noShowCheckAt: null,
      },
      include: {
        tutor: { select: { id: true, hourlyRate: true } },
        student: { select: { id: true } },
        whiteboardSessions: { select: { data: true } },
      },
    });

    for (const booking of bookings) {
      try {
        const attendance = this.parseAttendance(booking.whiteboardSessions?.[0]?.data);
        const studentJoined = !!attendance.studentJoinedAt;
        const tutorJoined = !!attendance.tutorJoinedAt;

        if (studentJoined && tutorJoined) {
          await this.prisma.booking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.LIVE, noShowCheckAt: now },
          });
          continue;
        }

        const isTutorNoShow = studentJoined && !tutorJoined;
        const isStudentNoShow = tutorJoined && !studentJoined;
        const bothMissing = !studentJoined && !tutorJoined;

        await this.prisma.$transaction(async (tx) => {
          if (isTutorNoShow) {
            // Tutor no-show (student joined, tutor didn't): refund student
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
                refundProcessed: true,
                noShowCheckAt: now,
              },
            });

            // For paid bookings: refund 1 token to the student
            if (!booking.isDemo) {
              const refundAmount = 1;
              const existingBalance = await tx.tutorTokenBalance.findUnique({
                where: {
                  studentId_tutorId: {
                    studentId: booking.studentId,
                    tutorId: booking.tutorId,
                  },
                },
              });

              if (existingBalance) {
                await tx.tutorTokenBalance.update({
                  where: {
                    studentId_tutorId: {
                      studentId: booking.studentId,
                      tutorId: booking.tutorId,
                    },
                  },
                  data: { balance: { increment: refundAmount } },
                });
                await tx.student.update({
                  where: { id: booking.studentId },
                  data: { tokens: { increment: refundAmount } },
                });
              } else {
                await tx.student.update({
                  where: { id: booking.studentId },
                  data: { tokens: { increment: refundAmount } },
                });
              }

              await tx.tokenLedger.create({
                data: {
                  studentId: booking.studentId,
                  tutorId: booking.tutorId,
                  delta: new Prisma.Decimal(refundAmount),
                  reason: TokenReason.REFUND,
                  bookingId: booking.id,
                },
              });

              this.logger.log(
                `Tutor no-show (paid): refunded ${refundAmount} token for booking ${booking.id}`,
              );
            } else {
              // For demo bookings: the AUTO_CANCELLED_TUTOR_NO_SHOW status
              // automatically allows the student to book a new free demo with this tutor
              // (since hasUsedDemo only checks PENDING/CONFIRMED/COMPLETED statuses)
              this.logger.log(
                `Tutor no-show (demo): demo eligibility restored for booking ${booking.id}`,
              );
            }
          } else if (isStudentNoShow) {
            // Student no-show (tutor joined, student didn't):
            // Mark noShowCheckAt so this isn't re-processed. Tutor stays in class.
            // Payout to tutor happens after class ends (see handlePostClassNoShow).
            await tx.booking.update({
              where: { id: booking.id },
              data: { noShowCheckAt: now },
            });
            this.logger.log(
              `Student no-show: tutor staying in class for booking ${booking.id}, payout deferred to after class ends`,
            );
          } else if (bothMissing) {
            // Both missing: no refund, no payout — company keeps the money
            await tx.booking.update({
              where: { id: booking.id },
              data: { noShowCheckAt: now },
            });
            this.logger.log(
              `Both parties no-show for booking ${booking.id}: no refund, no payout (company profit)`,
            );
          }
        });
      } catch (error) {
        this.logger.warn(`Failed no-show handling for booking ${booking.id}: ${error}`);
      }
    }
  }

  // 2.6) Every minute: after class ends, pay tutor for student-no-show sessions
  @Interval(60 * 1000)
  async handlePostClassNoShow() {
    const now = new Date();

    // Find sessions where: tutor joined but student didn't, class has ended,
    // noShowCheckAt was set (by handleNoShowBookings) but status wasn't changed yet
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.WAITING_ROOM, BookingStatus.LIVE] },
        endTime: { not: null, lt: now },
        noShowCheckAt: { not: null },
      },
      include: {
        tutor: { select: { id: true, hourlyRate: true } },
        student: { select: { id: true } },
        whiteboardSessions: { select: { data: true } },
      },
    });

    for (const booking of bookings) {
      try {
        const attendance = this.parseAttendance(booking.whiteboardSessions?.[0]?.data);
        const tutorJoined = !!attendance.tutorJoinedAt;
        const studentJoined = !!attendance.studentJoinedAt;

        if (tutorJoined && !studentJoined) {
          // Student no-show, class has ended: pay tutor
          await this.prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
                refundProcessed: true,
              },
            });

            if (!booking.isDemo) {
              const start = booking.startTime!;
              const end = booking.endTime ?? addMinutes(start, 60);
              const hours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
              const hourlyRate = Number(booking.tutor?.hourlyRate ?? 0);
              const bookingAmount = hours * hourlyRate;

              const feePercent = this.platformFeePercent(hourlyRate);
              const tutorShare = Math.max(0, (bookingAmount * (100 - feePercent)) / 100);

              if (tutorShare > 0) {
                await tx.tutorWallet.upsert({
                  where: { tutorId: booking.tutorId },
                  update: { balance: { increment: tutorShare } },
                  create: { tutorId: booking.tutorId, balance: tutorShare },
                });

                await tx.tutorWalletLedger.create({
                  data: {
                    tutorId: booking.tutorId,
                    bookingId: booking.id,
                    delta: tutorShare,
                    reason: 'BOOKING_EARNED',
                    note: `Student no-show payout for booking ${booking.id}`,
                  },
                });
              }
            }

            this.logger.log(
              `Student no-show (post-class): paid tutor for booking ${booking.id}`,
            );
          });
        } else if (!tutorJoined && !studentJoined) {
          // Both missing, class ended: mark as processed, no money movement
          await this.prisma.booking.update({
            where: { id: booking.id },
            data: { refundProcessed: true },
          });
          this.logger.log(
            `Both no-show (post-class): marked booking ${booking.id} as processed, company keeps tokens`,
          );
        }
      } catch (error) {
        this.logger.warn(`Failed post-class no-show handling for booking ${booking.id}: ${error}`);
      }
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

  // 4) Daily at 03:00 UTC: Check for inactive tutors and send alerts
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async checkInactiveTutors() {
    this.logger.log('Running inactive tutor check...');
    try {
      await this.availabilityTracking.checkInactiveTutorsAndAlert();
    } catch (error) {
      this.logger.error('Error checking inactive tutors:', error);
    }
  }

  // 5) Every 6 hours: Check for pending tokens and send 48-hour warnings
  @Cron('0 */6 * * *')
  async checkPendingTokens() {
    this.logger.log('Running pending tokens check...');
    try {
      await this.availabilityTracking.checkPendingTokensAndWarn();
    } catch (error) {
      this.logger.error('Error checking pending tokens:', error);
    }
  }

  // 6) Daily at 04:00 UTC: Update all tutor availability metrics
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async updateAllTutorMetrics() {
    this.logger.log('Updating all tutor availability metrics...');
    try {
      const tutors = await this.prisma.tutor.findMany({
        where: { status: 'APPROVED' },
        select: { id: true },
      });

      for (const tutor of tutors) {
        await this.availabilityTracking.updateTutorAvailabilityMetrics(tutor.id);
      }

      this.logger.log(`Updated metrics for ${tutors.length} tutors`);
    } catch (error) {
      this.logger.error('Error updating tutor metrics:', error);
    }
  }
}
