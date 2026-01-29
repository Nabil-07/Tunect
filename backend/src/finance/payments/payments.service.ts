import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentPayments(page: number = 1, pageSize: number = 100) {
    const skip = (page - 1) * pageSize;

    // Get all completed/confirmed bookings (student payments)
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ['COMPLETED', 'CONFIRMED'] },
        isDemo: false,
        tokensCharged: { gt: 0 },
      },
      include: {
        student: {
          include: { user: true },
        },
        tutor: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    const total = await this.prisma.booking.count({
      where: {
        status: { in: ['COMPLETED', 'CONFIRMED'] },
        isDemo: false,
        tokensCharged: { gt: 0 },
      },
    });

    // Map to frontend format
    const payments = bookings.map((booking) => {
      const tokens = Number(booking.tokensCharged || 0);
      const hourlyRate = Number(booking.tutor.hourlyRate || 0);
      const bookingAmount = tokens * hourlyRate; // tokens = hours, so total amount student paid

      return {
        id: booking.id,
        bookingId: booking.id,
        orderId: booking.id,
        studentId: booking.studentId,
        studentName: booking.student?.user?.name || '',
        studentEmail: booking.student?.user?.email || '',
        tutorId: booking.tutorId,
        tutorName: booking.tutor.user?.name || '',
        amount: Math.round(bookingAmount * 100), // Convert to paise
        amountAtBooking: Math.round(bookingAmount * 100),
        paidAt: booking.createdAt.toISOString(),
        receiptUrl: undefined,
        isBanned: booking.student?.user?.isBanned || false,
      };
    });

    return {
      payments,
      total,
    };
  }

  async getTutorPaymentsDue(page: number = 1, pageSize: number = 100) {
    // Get all tutors with their confirmed/completed bookings (non-demo)
    const tutors = await this.prisma.tutor.findMany({
      include: {
        user: true,
        bookings: {
          where: {
            status: { in: ['COMPLETED', 'CONFIRMED'] },
            isDemo: false,
            tokensCharged: { gt: 0 },
          },
          include: {
            student: { include: { user: true } },
          },
        },
        payouts: {
          where: {
            status: 'PAID', // Only count paid payouts as "paid"
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

      for (const booking of tutor.bookings) {
        const tokensCharged = Number(booking.tokensCharged || 0);
        const hourlyRate = Number(tutor.hourlyRate || 0);
        const bookingAmount = tokensCharged * hourlyRate; // hours * rupees/hour = rupees
        const commissionRate = this.getCommissionRate(hourlyRate);
        const tutorPaymentINR = bookingAmount * ((100 - commissionRate) / 100); // in INR
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
          amountPaid: isBanned ? 0 : tutorPayment,
          status: isBanned ? 'blocked' : 'pending',
          blockedReason: isBanned
            ? `Tutor banned on ${tutor.user?.bannedAt?.toLocaleDateString()}`
            : undefined,
        });

        totalDue += tutorPayment;
      }

      // Calculate total paid from completed payouts
      totalPaid = tutor.payouts.reduce((sum, payout) => {
        return sum + Math.round(Number(payout.amount) * 100); // Convert to paise
      }, 0);

      tutorDues.push({
        tutorId: tutor.id,
        tutorName: tutor.user?.name || '',
        tutorEmail: tutor.user?.email || '',
        totalDue,
        totalPaid,
        paymentSchedule,
        commissionRate: this.getCommissionRate(Number(tutor.hourlyRate || 0)),
        isBanned: tutor.user?.isBanned || false,
        bannedDate: tutor.user?.bannedAt?.toISOString(),
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

