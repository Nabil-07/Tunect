import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';
import { AvailabilityTrackingService } from '../availability/availability-tracking.service';
import { TutorsService } from '../tutors/tutors.service';
import { NotificationsService } from '../notifications/notifications.service';
import { fromUtc } from '../common/time.util';
import { addMinutes } from 'date-fns';
import { BookingStatus, Prisma, TokenReason } from '@prisma/client';
import { restoreTutorTokenLotsForBooking } from '../tutors/token-lots.helper';
import { computeBookingEarnings, platformFeePercent } from '../common/earnings';

// Config: how many minutes before session we remind
const REMIND_BEFORE_MIN = 30;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: NotifierService,
    private availabilityTracking: AvailabilityTrackingService,
    private tutorsService: TutorsService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Increment demerit points for tutor no-show.
   * At 3 demerits: deduct hourly rate from wallet and reset to 0.
   */
  private async applyTutorDemerit(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    tutorId: string,
    bookingId: string,
  ) {
    const tutor = await tx.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, demeritPoints: true, hourlyRate: true },
    });
    if (!tutor) return;

    let newDemeritPoints = (tutor.demeritPoints ?? 0) + 1;

    if (newDemeritPoints >= 3) {
      const hourlyRate = Number(tutor.hourlyRate ?? 0);
      if (hourlyRate > 0) {
        await tx.tutorWalletLedger.create({
          data: {
            tutorId: tutor.id,
            bookingId,
            delta: new Prisma.Decimal(-hourlyRate),
            reason: 'DEMERIT_PENALTY',
            note: `Demerit penalty: ${hourlyRate} deducted from payout due to 3 demerit points`,
          },
        });
        await tx.tutorWallet.upsert({
          where: { tutorId: tutor.id },
          update: { balance: { decrement: hourlyRate } },
          create: { tutorId: tutor.id, balance: new Prisma.Decimal(-hourlyRate) },
        });
      }
      await tx.tutor.update({
        where: { id: tutor.id },
        data: { demeritPoints: 0, lastDemeritReset: new Date() },
      });
      this.logger.log(`Demerit penalty applied for tutor ${tutorId}: 3 demerits reached, ${Number(tutor.hourlyRate ?? 0)} deducted`);
    } else {
      await tx.tutor.update({
        where: { id: tutor.id },
        data: { demeritPoints: newDemeritPoints },
      });
      this.logger.log(`Demerit point incremented for tutor ${tutorId}: now ${newDemeritPoints}`);
    }
  }

  private getBookingHours(
    startTime?: Date | null,
    endTime?: Date | null,
    fallbackTokens?: number | null,
  ): number {
    if (startTime && endTime) {
      const diffMs = endTime.getTime() - startTime.getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) return diffMs / 3_600_000;
    }
    const fallback = Number(fallbackTokens ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  /**
   * Credit tutor wallet for a completed / student-no-show booking.
   * Uses FIFO lot consumption → priceAtBooking fallback. Never tutor.hourlyRate.
   */
  private async creditTutorForBooking(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    booking: {
      id: string;
      tutorId: string;
      isDemo: boolean;
      startTime: Date | null;
      endTime: Date | null;
      tokensCharged: Prisma.Decimal | number | null;
      priceAtBooking: Prisma.Decimal | number | null;
    },
    note: string,
  ): Promise<void> {
    if (booking.isDemo) return;

    const existingLedger = await tx.tutorWalletLedger.findFirst({
      where: { bookingId: booking.id, reason: 'BOOKING_EARNED' },
      select: { id: true },
    });
    if (existingLedger) return;

    const consumptions = await tx.bookingLotConsumption.findMany({
      where: { bookingId: booking.id, reversed: false },
      select: { qty: true, pricePerToken: true, reversed: true },
    });
    const hours = this.getBookingHours(
      booking.startTime,
      booking.endTime,
      Number(booking.tokensCharged ?? 0),
    );
    const earnings = computeBookingEarnings({
      consumptions,
      fallbackPriceAtBooking: Number(booking.priceAtBooking ?? 0),
      hours,
      tokensCharged: Number(booking.tokensCharged ?? 0),
    });
    if (earnings.tutorShare <= 0) return;

    const tutorShare = earnings.tutorShare;
    const effectiveRate = earnings.effectiveRate;
    const feePercent = platformFeePercent(effectiveRate);

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
        note: `${note} (rate: ₹${effectiveRate.toFixed(2)}/hr, fee: ${feePercent}%, earned: ₹${tutorShare.toFixed(2)}${earnings.usedConsumptionRows ? ', source: lots' : ''})`,
      },
    });
  }

  private parseAttendance(
    attendanceRow: any,
    whiteboardData: any,
  ): { studentJoinedAt?: string; tutorJoinedAt?: string; startedAt?: string } {
    const fromDb = (() => {
      if (!attendanceRow) return {};
      return {
        studentJoinedAt:
          attendanceRow.studentFirstJoinedAt instanceof Date
            ? attendanceRow.studentFirstJoinedAt.toISOString()
            : undefined,
        tutorJoinedAt:
          attendanceRow.tutorFirstJoinedAt instanceof Date
            ? attendanceRow.tutorFirstJoinedAt.toISOString()
            : undefined,
        startedAt:
          attendanceRow.classStartedAt instanceof Date
            ? attendanceRow.classStartedAt.toISOString()
            : undefined,
      };
    })();

    const fromWb = (() => {
      const data = whiteboardData;
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
    })();

    // Filter out undefined values so DB row with null join times
    // (e.g. waiting-room-only upsert) doesn't overwrite valid WB values
    const defined = (obj: Record<string, any>) =>
      Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
    return {
      ...fromWb,
      ...defined(fromDb),
    };
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

  // 2) Nightly cleanup at 02:00 UTC: safety-net auto-complete past sessions
  // handlePostClassNoShow (every minute) handles most cases; this is the daily catch-all
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async completePastSessions() {
    const now = new Date();
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.LIVE, BookingStatus.WAITING_ROOM] },
        endTime: { not: null, lt: now },
      },
      select: {
        id: true,
        tutorId: true,
        studentId: true,
        isDemo: true,
        status: true,
        startTime: true,
        endTime: true,
        tokensCharged: true,
        priceAtBooking: true,
        noShowCheckAt: true,
        refundProcessed: true,
        attendance: true,
        whiteboardSessions: { select: { data: true } },
      },
    });

    let processedCount = 0;

    for (const booking of bookings) {
      let noShowType: 'TUTOR_NO_SHOW' | 'STUDENT_NO_SHOW' | null = null;
      try {
        const attendance = this.parseAttendance(booking.attendance, booking.whiteboardSessions?.[0]?.data);
        const tutorJoined = !!attendance.tutorJoinedAt;
        const studentJoined = !!attendance.studentJoinedAt;

        await this.prisma.$transaction(async (tx) => {
          if (tutorJoined && studentJoined) {
            // Both attended → COMPLETED + pay tutor
            await tx.booking.update({
              where: { id: booking.id },
              data: { status: BookingStatus.COMPLETED },
            });

            await this.creditTutorForBooking(
              tx,
              booking,
              `Nightly auto-complete for booking ${booking.id}`,
            );
          } else if (tutorJoined && !studentJoined) {
            // Student no-show → AUTO_CANCELLED_STUDENT_NO_SHOW + pay tutor
            noShowType = 'STUDENT_NO_SHOW';
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
                refundProcessed: true,
                noShowCheckAt: booking.noShowCheckAt ?? now,
              },
            });

            await this.creditTutorForBooking(
              tx,
              booking,
              `Nightly student-no-show payout for booking ${booking.id}`,
            );
          } else if (!tutorJoined && studentJoined) {
            // Tutor no-show safety net → AUTO_CANCELLED_TUTOR_NO_SHOW + refund + demerit
            noShowType = 'TUTOR_NO_SHOW';
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
                refundProcessed: true,
                noShowCheckAt: booking.noShowCheckAt ?? now,
              },
            });

            // Increment demerit points for tutor no-show
            await this.applyTutorDemerit(tx, booking.tutorId, booking.id);

            if (!booking.isDemo) {
              const existingRefund = await tx.tokenLedger.findFirst({
                where: { bookingId: booking.id, reason: TokenReason.REFUND },
                select: { id: true },
              });
              if (!existingRefund) {
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
                }
                await tx.student.update({
                  where: { id: booking.studentId },
                  data: { tokens: { increment: refundAmount } },
                });
                await tx.tokenLedger.create({
                  data: {
                    studentId: booking.studentId,
                    tutorId: booking.tutorId,
                    delta: new Prisma.Decimal(refundAmount),
                    reason: TokenReason.REFUND,
                    bookingId: booking.id,
                  },
                });
                await restoreTutorTokenLotsForBooking(tx, {
                  bookingId: booking.id,
                  qty: refundAmount,
                });
              }
            }
          } else {
            // Neither joined → CANCELED, company keeps tokens
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.CANCELED,
                refundProcessed: true,
                noShowCheckAt: booking.noShowCheckAt ?? now,
              },
            });
          }
        });

        if (noShowType) {
          const bk = await this.prisma.booking.findUnique({
            where: { id: booking.id },
            select: {
              startTime: true,
              isDemo: true,
              student: { select: { user: { select: { email: true, name: true } } } },
              tutor: { select: { user: { select: { name: true } } } },
            },
          });
          if (bk?.student?.user?.email) {
            this.notifications.bookingCancellationEmail({
              studentEmail: bk.student.user.email,
              studentName: bk.student.user.name ?? undefined,
              tutorName: bk.tutor?.user?.name ?? undefined,
              bookingId: booking.id,
              startIso: bk.startTime?.toISOString(),
              reason: noShowType,
              tokensRefunded: noShowType === 'TUTOR_NO_SHOW' && !bk.isDemo ? 1 : 0,
            }).catch(() => {});
          }
        }

        processedCount += 1;
      } catch (error) {
        this.logger.warn(`Failed to process stale booking ${booking.id}: ${error}`);
      }
    }

    if (processedCount > 0) {
      this.logger.log(`Nightly cleanup: processed ${processedCount} stale bookings.`);
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
        attendance: true,
        whiteboardSessions: { select: { data: true } },
      },
    });

    for (const booking of bookings) {
      try {
        const attendance = this.parseAttendance(booking.attendance, booking.whiteboardSessions?.[0]?.data);
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
            // Tutor no-show (student joined, tutor didn't): refund student + demerit
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
                refundProcessed: true,
                noShowCheckAt: now,
              },
            });

            // Increment demerit points for tutor no-show
            await this.applyTutorDemerit(tx, booking.tutorId, booking.id);

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

              await restoreTutorTokenLotsForBooking(tx, {
                bookingId: booking.id,
                qty: refundAmount,
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

        if (isTutorNoShow) {
          const bk = await this.prisma.booking.findUnique({
            where: { id: booking.id },
            select: {
              startTime: true,
              isDemo: true,
              student: { select: { user: { select: { email: true, name: true } } } },
              tutor: { select: { user: { select: { name: true } } } },
            },
          });
          if (bk?.student?.user?.email) {
            this.notifications.bookingCancellationEmail({
              studentEmail: bk.student.user.email,
              studentName: bk.student.user.name ?? undefined,
              tutorName: bk.tutor?.user?.name ?? undefined,
              bookingId: booking.id,
              startIso: bk.startTime?.toISOString(),
              reason: 'TUTOR_NO_SHOW',
              tokensRefunded: !bk.isDemo ? 1 : 0,
            }).catch(() => {});
          }
        }
      } catch (error) {
        this.logger.warn(`Failed no-show handling for booking ${booking.id}: ${error}`);
      }
    }
  }

  // 2.6) Every minute: after class ends, finalize all non-completed past bookings
  // This is the catch-all safety net that handles:
  //   - Student no-show (tutor joined, student didn't) → AUTO_CANCELLED_STUDENT_NO_SHOW + pay tutor
  //   - Both joined but booking wasn't completed (e.g., frontend failed to call /complete) → COMPLETED + pay tutor
  //   - Both missing (nobody joined) → mark refundProcessed, company keeps tokens
  //   - Tutor no-show missed by handleNoShowBookings → AUTO_CANCELLED_TUTOR_NO_SHOW + refund
  // Uses a 5-minute grace period after endTime to avoid premature processing
  @Interval(60 * 1000)
  async handlePostClassNoShow() {
    const now = new Date();
    const gracePeriodEnd = addMinutes(now, -5); // 5 min after endTime

    // Find ALL bookings that ended 5+ min ago and are still in a non-terminal status
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.WAITING_ROOM, BookingStatus.LIVE] },
        endTime: { not: null, lt: gracePeriodEnd },
      },
      select: {
        id: true,
        tutorId: true,
        studentId: true,
        isDemo: true,
        status: true,
        startTime: true,
        endTime: true,
        tokensCharged: true,
        priceAtBooking: true,
        noShowCheckAt: true,
        refundProcessed: true,
        attendance: true,
        whiteboardSessions: { select: { data: true } },
      },
    });

    for (const booking of bookings) {
      let noShowType: 'TUTOR_NO_SHOW' | 'STUDENT_NO_SHOW' | null = null;
      try {
        const attendance = this.parseAttendance(booking.attendance, booking.whiteboardSessions?.[0]?.data);
        const tutorJoined = !!attendance.tutorJoinedAt;
        const studentJoined = !!attendance.studentJoinedAt;

        if (tutorJoined && studentJoined) {
          // Both joined, class ended — complete the booking + pay tutor
          // (safety net if frontend POST /bookings/:id/complete didn't fire)
          await this.prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: booking.id },
              data: { status: BookingStatus.COMPLETED, noShowCheckAt: now },
            });

            await this.creditTutorForBooking(
              tx,
              booking,
              `Post-class auto-complete for booking ${booking.id}`,
            );

            this.logger.log(
              `Post-class auto-complete: both attended, completed booking ${booking.id}`,
            );
          });
        } else if (tutorJoined && !studentJoined) {
          // Student no-show, class has ended: pay tutor
          await this.prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
                refundProcessed: true,
                noShowCheckAt: booking.noShowCheckAt ?? now,
              },
            });

            await this.creditTutorForBooking(
              tx,
              booking,
              `Student no-show payout for booking ${booking.id}`,
            );

            this.logger.log(
              `Student no-show (post-class): paid tutor for booking ${booking.id}`,
            );
            noShowType = 'STUDENT_NO_SHOW';
          });
        } else if (!tutorJoined && studentJoined) {
          // Tutor no-show that handleNoShowBookings somehow missed
          // (e.g., server was down during the 10-min window)
          await this.prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
                refundProcessed: true,
                noShowCheckAt: booking.noShowCheckAt ?? now,
              },
            });

            // Increment demerit points for tutor no-show
            await this.applyTutorDemerit(tx, booking.tutorId, booking.id);

            // Refund student
            if (!booking.isDemo) {
              const refundAmount = 1;
              const existingRefund = await tx.tokenLedger.findFirst({
                where: { bookingId: booking.id, reason: TokenReason.REFUND },
                select: { id: true },
              });

              if (!existingRefund) {
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
                }

                await tx.student.update({
                  where: { id: booking.studentId },
                  data: { tokens: { increment: refundAmount } },
                });

                await tx.tokenLedger.create({
                  data: {
                    studentId: booking.studentId,
                    tutorId: booking.tutorId,
                    delta: new Prisma.Decimal(refundAmount),
                    reason: TokenReason.REFUND,
                    bookingId: booking.id,
                  },
                });

                await restoreTutorTokenLotsForBooking(tx, {
                  bookingId: booking.id,
                  qty: refundAmount,
                });
              }
            }

            this.logger.log(
              `Tutor no-show (post-class safety net): refunded student for booking ${booking.id}`,
            );
            noShowType = 'TUTOR_NO_SHOW';
          });
        } else {
          // Neither joined — company keeps tokens, no money movement
          await this.prisma.booking.update({
            where: { id: booking.id },
            data: {
              status: BookingStatus.CANCELED,
              refundProcessed: true,
              noShowCheckAt: booking.noShowCheckAt ?? now,
            },
          });
          this.logger.log(
            `Both no-show (post-class): booking ${booking.id} cancelled, company keeps tokens`,
          );
        }
        if (noShowType) {
          const bk = await this.prisma.booking.findUnique({
            where: { id: booking.id },
            select: {
              startTime: true,
              isDemo: true,
              student: { select: { user: { select: { email: true, name: true } } } },
              tutor: { select: { user: { select: { name: true } } } },
            },
          });
          if (bk?.student?.user?.email) {
            this.notifications.bookingCancellationEmail({
              studentEmail: bk.student.user.email,
              studentName: bk.student.user.name ?? undefined,
              tutorName: bk.tutor?.user?.name ?? undefined,
              bookingId: booking.id,
              startIso: bk.startTime?.toISOString(),
              reason: noShowType,
              tokensRefunded: noShowType === 'TUTOR_NO_SHOW' && !bk.isDemo ? 1 : 0,
            }).catch(() => {});
          }
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

  // 7) Every hour: Auto-sync trending status for tutors with 4.5+ avg rating
  @Cron(CronExpression.EVERY_HOUR)
  async syncAutoTrending() {
    this.logger.log('Running auto-trending sync...');
    try {
      const result = await this.tutorsService.syncAutoTrending();
      if (result.promoted > 0 || result.demoted > 0) {
        this.logger.log(`Auto-trending sync complete: promoted=${result.promoted}, demoted=${result.demoted}`);
      }
    } catch (error) {
      this.logger.error('Error syncing auto-trending:', error);
    }
  }

  // 8) Daily at 01:00 UTC: Expire TutorTokenLot rows whose expiresAt has passed.
  // For each expired lot with remainingQty > 0:
  //   - decrement TutorTokenBalance.balance by remainingQty
  //   - set lot.remainingQty = 0
  //   - write TokenLedger row (negative delta) for traceability
  // Idempotent: re-running is a no-op once remainingQty reaches 0.
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireTokenLots() {
    this.logger.log('Running token lot expiry sweep...');
    const now = new Date();
    const BATCH_SIZE = 500;
    let totalExpiredLots = 0;
    let totalExpiredTokens = 0;

    try {
      // Loop in batches to keep transactions short.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const expiredLots = await this.prisma.tutorTokenLot.findMany({
          where: {
            expiresAt: { lt: now, not: null },
            remainingQty: { gt: 0 },
          },
          orderBy: { expiresAt: 'asc' },
          take: BATCH_SIZE,
          select: {
            id: true,
            studentId: true,
            tutorId: true,
            remainingQty: true,
            expiresAt: true,
          },
        });

        if (expiredLots.length === 0) break;

        for (const lot of expiredLots) {
          const qty = Number(lot.remainingQty);
          if (!(qty > 0)) continue;
          try {
            await this.prisma.$transaction(async (tx) => {
              // Re-read inside tx to guard against concurrent mutations.
              const fresh = await tx.tutorTokenLot.findUnique({
                where: { id: lot.id },
                select: { remainingQty: true },
              });
              const freshQty = Number(fresh?.remainingQty ?? 0);
              if (!(freshQty > 0)) return;

              await tx.tutorTokenLot.update({
                where: { id: lot.id },
                data: { remainingQty: new Prisma.Decimal(0) },
              });

              // Decrement per-tutor balance, but never below zero.
              const balance = await tx.tutorTokenBalance.findUnique({
                where: {
                  studentId_tutorId: {
                    studentId: lot.studentId,
                    tutorId: lot.tutorId,
                  },
                },
                select: { balance: true },
              });
              if (balance) {
                const currentBal = Number(balance.balance);
                const decBy = Math.min(currentBal, freshQty);
                if (decBy > 0) {
                  await tx.tutorTokenBalance.update({
                    where: {
                      studentId_tutorId: {
                        studentId: lot.studentId,
                        tutorId: lot.tutorId,
                      },
                    },
                    data: { balance: { decrement: decBy } },
                  });
                }
              }

              // Keep the aggregate student balance in sync too, never below zero.
              const s = await tx.student.findUnique({
                where: { id: lot.studentId },
                select: { tokens: true },
              });
              if (s) {
                const currentTokens = Number(s.tokens ?? 0);
                const studentDecBy = Math.min(currentTokens, freshQty);
                if (studentDecBy > 0) {
                  await tx.student.update({
                    where: { id: lot.studentId },
                    data: { tokens: { decrement: studentDecBy } },
                  });
                }
              }

              await tx.tokenLedger.create({
                data: {
                  studentId: lot.studentId,
                  tutorId: lot.tutorId,
                  delta: new Prisma.Decimal((-freshQty).toString()),
                  reason: TokenReason.ADMIN_ADJUSTMENT,
                  expiresAt: lot.expiresAt,
                  description: `Token lot expired (lot ${lot.id})`,
                },
              });

              totalExpiredLots += 1;
              totalExpiredTokens += freshQty;
            });
          } catch (err) {
            this.logger.warn(
              `Failed to expire token lot ${lot.id}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }

        if (expiredLots.length < BATCH_SIZE) break;
      }

      if (totalExpiredLots > 0) {
        this.logger.log(
          `Token lot expiry: expired ${totalExpiredLots} lot(s), ${totalExpiredTokens} token(s) total`,
        );
      }
    } catch (error) {
      this.logger.error('Error during token lot expiry sweep:', error);
    }
  }
}
