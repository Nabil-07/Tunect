import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeBookingEarnings } from '../../common/earnings';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private getBookingHours(startTime?: Date | null, endTime?: Date | null, fallbackTokens?: number | null): number {
    if (startTime && endTime) {
      const diffMs = endTime.getTime() - startTime.getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) return diffMs / 3_600_000;
    }
    const fallback = Number(fallbackTokens ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  async getStudentPayments(page: number = 1, pageSize: number = 100, status?: string) {
    const skip = (page - 1) * pageSize;

    // Build where clause based on status filter
    const whereClause: any = {};
    if (status) {
      if (status === 'successful') {
        whereClause.status = 'SUCCEEDED';
      } else if (status === 'failed') {
        whereClause.status = 'FAILED';
      } else if (status === 'pending') {
        whereClause.status = 'PENDING';
      } else if (status === 'all') {
        // No status filter - show all
      } else {
        whereClause.status = status.toUpperCase(); // Allow direct status values
      }
    } else {
      // Default behavior: only successful payments
      whereClause.status = 'SUCCEEDED';
    }

    // Query actual Payment model records (Razorpay transactions) — not bookings
    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isBanned: true,
              student: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.payment.count({
        where: whereClause,
      }),
    ]);

    const mapped = payments.map((payment) => ({
      id: payment.id,
      bookingId: payment.id,
      orderId: payment.providerOrderId || payment.id,
      studentId: payment.user?.student?.id || '',
      studentName: payment.user?.name || '',
      studentEmail: payment.user?.email || '',
      tutorId: '',
      tutorName: '',
      amount: payment.amountInMinor,
      amountAtBooking: payment.amountInMinor,
      paidAt: payment.createdAt.toISOString(),
      receiptUrl: undefined,
      isBanned: payment.user?.isBanned || false,
      tokensPurchased: payment.tokensPurchased,
      provider: payment.provider,
      status: payment.status,
    }));

    return {
      payments: mapped,
      total,
    };
  }

  async markPaymentSuccessful(paymentId: string) {
    // Fetch payment and related user info
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isBanned: true,
            student: { select: { id: true } },
          },
        },
      },
    });
    if (!payment) throw new Error('Payment not found');

    // Only proceed if not already succeeded
    if (payment.status === 'SUCCEEDED') {
      return { status: 'already_succeeded' };
    }

    // Extract info
    const studentId = payment.user?.student?.id;
    const tokensPurchased = Number(payment.tokensPurchased ?? 0);
    const amountInMinor = Number(payment.amountInMinor ?? 0);
    const metadata = payment.metadata as any;
    const tutorId = metadata?.tutorId || '';
    const pricePerToken = tokensPurchased > 0 ? amountInMinor / 100 / tokensPurchased : 0;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 60);

    // Credit tokens, update ledgers, balances, lots, and set status
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'SUCCEEDED' },
      });

      if (studentId && tokensPurchased > 0) {
        const existingLedger = await tx.tokenLedger.findFirst({
          where: { paymentId, studentId },
          select: { id: true },
        });
        if (!existingLedger) {
          await tx.tokenLedger.create({
            data: {
              studentId,
              tutorId,
              delta: tokensPurchased,
              reason: 'PURCHASED',
              expiresAt: expiryDate,
              paymentId,
            },
          });
          await tx.student.update({
            where: { id: studentId },
            data: { tokens: { increment: tokensPurchased } },
          });
          await tx.tutorTokenBalance.upsert({
            where: { studentId_tutorId: { studentId, tutorId } },
            update: {
              balance: { increment: tokensPurchased },
              pricePerToken,
            },
            create: {
              studentId,
              tutorId,
              balance: tokensPurchased,
              pricePerToken,
            },
          });
          await tx.tutorTokenLot.create({
            data: {
              studentId,
              tutorId,
              pricePerToken,
              initialQty: tokensPurchased,
              remainingQty: tokensPurchased,
              paymentId,
              expiresAt: expiryDate,
            },
          });
        }
      }
    });

    // Send notifications (fire-and-forget)
    try {
      if (studentId && payment.user?.email) {
        // You may want to inject NotificationsService for richer notifications
        // For now, just log
        // TODO: Use notifications service if available
        // e.g. this.notifications.createPaymentNotification(...)
        // e.g. this.notifications.paymentReceiptEmail(...)
        // For now, just log
        // console.log(`Admin marked payment as successful: tokens credited to student ${studentId}`);
      }
    } catch (e) {
      // Ignore notification errors
    }

    // Return updated payment info
    return {
      id: payment.id,
      bookingId: payment.id,
      orderId: payment.providerOrderId || payment.id,
      studentId,
      studentName: payment.user?.name || '',
      studentEmail: payment.user?.email || '',
      tutorId,
      tutorName: '',
      amount: payment.amountInMinor,
      amountAtBooking: payment.amountInMinor,
      paidAt: payment.createdAt.toISOString(),
      receiptUrl: undefined,
      isBanned: payment.user?.isBanned || false,
      tokensPurchased: payment.tokensPurchased,
      provider: payment.provider,
      status: 'SUCCEEDED',
    };
  }

  async getTutorPaymentsDue(page: number = 1, pageSize: number = 100) {
    const now = new Date();

    // Get all tutors with their completed/ended bookings (non-demo)
    // CONFIRMED bookings only included if endTime is in the past (class ended, cron hasn't flipped status yet)
    const tutors = await this.prisma.tutor.findMany({
      include: {
        user: true,
        bookings: {
          where: {
            isDemo: false,
            tokensCharged: { gt: 0 },
            OR: [
              { status: { in: ['COMPLETED', 'AUTO_CANCELLED_STUDENT_NO_SHOW'] } },
              { status: 'CONFIRMED', endTime: { lt: now } },
            ],
          },
          include: {
            student: { include: { user: true } },
            lotConsumptions: {
              where: { reversed: false },
              select: { qty: true, pricePerToken: true, reversed: true },
            },
          },
        },
        payouts: {
          where: {
            status: 'PAID', // Only count paid payouts as "paid"
          },
        },
        // Pull all negative-delta wallet entries (penalties, ban forfeitures,
        // manual adjustments) so they are subtracted from "Total Due". Without
        // this, admin would over-pay any tutor who has been penalised.
        walletLedger: {
          where: {
            delta: { lt: 0 },
            reason: { in: ['DEMERIT_PENALTY', 'ADJUSTMENT'] },
          },
          select: { id: true, delta: true, reason: true, note: true, createdAt: true },
        },
        kycApplications: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            bankAccountHolder: true,
            bankName: true,
            accountNumber: true,
            ifsc: true,
            upiId: true,
          },
        },
      },
    });

    const tutorDues: any[] = [];

    for (const tutor of tutors) {
      if (tutor.bookings.length === 0) continue;

      const paymentSchedule: any[] = [];
      let totalDue = 0;
      let totalPaid = 0;
      let penaltiesDeducted = 0; // paise

      for (const booking of tutor.bookings) {
        const hours = this.getBookingHours(booking.startTime, booking.endTime, Number(booking.tokensCharged || 0));
        // Earnings precedence: BookingLotConsumption rows → priceAtBooking fallback.
        // NEVER use tutor.hourlyRate — it may have changed since booking.
        const earn = computeBookingEarnings({
          consumptions: (booking as any).lotConsumptions,
          fallbackPriceAtBooking: Number(booking.priceAtBooking ?? 0),
          hours,
          tokensCharged: Number(booking.tokensCharged ?? 0),
        });
        if (earn.tutorShare <= 0) continue;
        const hourlyRate = earn.effectiveRate;
        const bookingAmount = earn.gross;
        const commissionRate = this.getCommissionRate(hourlyRate);
        const tutorPaymentINR = earn.tutorShare; // in INR
        const tutorPayment = Math.round(tutorPaymentINR * 100); // Convert to paise for API

        const dueDate = this.calculatePaymentDueDate(booking.endTime || booking.createdAt);
        const isBanned =
          tutor.user?.isBanned &&
          tutor.user?.bannedAt &&
          tutor.user.bannedAt <= (booking.endTime || booking.createdAt);

        paymentSchedule.push({
          dueDate: dueDate.toISOString(),
          bookingsCount: 1,
          amountDue: tutorPayment,
          amountPaid: 0, // will be updated after totalPaid is computed
          status: isBanned ? 'blocked' : 'pending', // will be updated after totalPaid is computed
          blockedReason: isBanned
            ? `Tutor banned on ${tutor.user?.bannedAt?.toLocaleDateString()}`
            : undefined,
          bookingId: booking.id,
          bookingStatus: booking.status,
          studentName: booking.student?.user?.name || booking.student?.user?.email || '',
          sessionDate: (booking.startTime || booking.createdAt).toISOString(),
          sessionEndDate: booking.endTime?.toISOString() || null,
        });

        totalDue += tutorPayment;
      }

      // Calculate total paid from completed payouts
      totalPaid = tutor.payouts.reduce((sum, payout) => {
        return sum + Math.round(Number(payout.amount) * 100); // Convert to paise
      }, 0);

      // Subtract every negative-delta wallet ledger entry (DEMERIT_PENALTY,
      // ADJUSTMENT/ban forfeiture, etc.) from the gross totalDue. The wallet
      // ledger is the source of truth for amounts the tutor has had taken
      // off their payable balance — without this step the admin would
      // over-pay any penalised or partially-forfeited tutor.
      penaltiesDeducted = tutor.walletLedger.reduce((sum, entry) => {
        const amt = Math.abs(Number(entry.delta));
        return sum + Math.round(amt * 100); // paise
      }, 0);
      totalDue = Math.max(0, totalDue - penaltiesDeducted);

      // Update schedule item statuses based on actual payouts
      // Sort by dueDate ascending so earliest bookings get marked paid first
      paymentSchedule.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      let remainingPaid = totalPaid;
      for (const item of paymentSchedule) {
        if (item.status === 'blocked') continue;
        if (remainingPaid >= item.amountDue) {
          item.status = 'paid';
          item.amountPaid = item.amountDue;
          remainingPaid -= item.amountDue;
        } else if (remainingPaid > 0) {
          item.status = 'pending';
          item.amountPaid = remainingPaid;
          remainingPaid = 0;
        } else {
          item.status = 'pending';
          item.amountPaid = 0;
        }
      }

      const remaining = Math.max(0, totalDue - totalPaid);

      tutorDues.push({
        tutorId: tutor.id,
        tutorName: tutor.user?.name || '',
        tutorEmail: tutor.user?.email || '',
        totalDue,
        totalPaid,
        remaining,
        penaltiesDeducted,
        penalties: tutor.walletLedger.map((e) => ({
          id: e.id,
          amount: Math.round(Math.abs(Number(e.delta)) * 100),
          reason: e.reason,
          note: e.note ?? null,
          createdAt: e.createdAt.toISOString(),
        })),
        paymentSchedule,
        commissionRate: this.getCommissionRate(Number(tutor.hourlyRate || 0)),
        isBanned: tutor.user?.isBanned || false,
        bannedDate: tutor.user?.bannedAt?.toISOString(),
        bankInfo: tutor.kycApplications?.[0] || null,
      });
    }

    // Paginate results
    const total = tutorDues.length;
    const skip = (page - 1) * pageSize;
    const paginatedData = tutorDues.slice(skip, skip + pageSize);

    return {
      tutors: paginatedData,
      total,
    };
  }

  private getCommissionRate(hourlyRate: number): number {
    // 0-399 inr = 25%, 400-699 = 22%, 700+ = 18%
    if (hourlyRate < 400) return 25;
    if (hourlyRate < 700) return 22;
    return 18;
  }

  private calculatePaymentDueDate(bookingDate: Date): Date {
    const date = new Date(bookingDate);
    const dayOfMonth = date.getDate();

    // Payment schedule:
    // Bookings 1-6 → due on 7th
    // Bookings 7-13 → due on 14th
    // Bookings 14-20 → due on 21st
    // Bookings 21-31 → due on 1st of next month

    let dueDate: Date;

    if (dayOfMonth >= 1 && dayOfMonth <= 6) {
      dueDate = new Date(date.getFullYear(), date.getMonth(), 7);
    } else if (dayOfMonth >= 7 && dayOfMonth <= 13) {
      dueDate = new Date(date.getFullYear(), date.getMonth(), 14);
    } else if (dayOfMonth >= 14 && dayOfMonth <= 20) {
      dueDate = new Date(date.getFullYear(), date.getMonth(), 21);
    } else {
      // Next month, 1st
      dueDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    }

    return dueDate;
  }
}

