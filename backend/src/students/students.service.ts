import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return Number((v as any)?.toString?.() ?? v ?? 0);
}

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Helper method to ensure student profile exists, auto-creating if needed
   * @param userId - The user ID to check
   * @returns The student ID
   */
  private async ensureStudentProfile(userId: string): Promise<string> {
    let student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!student) {
      // Verify user exists and has STUDENT role
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) {
        throw new NotFoundException(`User not found: ${userId}`);
      }
      if (user.role !== 'STUDENT') {
        throw new NotFoundException(`User ${user.email} (${userId}) has role ${user.role}, not STUDENT`);
      }

      // Auto-create student profile if it doesn't exist (defensive approach)
      student = await this.prisma.student.create({
        data: { userId, tokens: 0 },
        select: { id: true },
      });
    }

    return student.id;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        student: {
          select: {
            id: true,
            grade: true,
            tokens: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    if (user.role !== 'STUDENT') {
      throw new NotFoundException(`User ${user.email} (${userId}) has role ${user.role}, not STUDENT`);
    }

    // Auto-create student profile if it doesn't exist (defensive approach)
    let student = user.student;
    if (!student) {
      student = await this.prisma.student.create({
        data: { userId, tokens: 0 },
        select: {
          id: true,
          grade: true,
          tokens: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [completedCount, monthlyBookings] = await Promise.all([
      this.prisma.booking.count({
        where: {
          studentId: student.id,
          endTime: { not: null, lt: now },
          status: { not: BookingStatus.CANCELED },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          studentId: student.id,
          endTime: { not: null, lt: now },
          status: { not: BookingStatus.CANCELED },
          startTime: { gte: startOfMonth },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const hoursStudied = monthlyBookings.reduce((sum, b) => {
      if (!b.startTime || !b.endTime) return sum;
      return sum + (b.endTime.getTime() - b.startTime.getTime()) / 3_600_000;
    }, 0);

    return {
      ...user,
      student: {
        ...student,
        tokens: toNum(student.tokens),
        hoursStudied: Math.round(hoursStudied * 10) / 10,
        sessionsCompleted: completedCount,
      },
    };
  }

  async patchMe(userId: string, data: { grade?: string }) {
    const studentId = await this.ensureStudentProfile(userId);

    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: { grade: data.grade },
      select: { id: true, grade: true, tokens: true, updatedAt: true },
    });

    return { ...updated, tokens: toNum(updated.tokens) };
  }

  // -------- Bookings with payment enrichment + unscheduled grouping --------
  async getMyBookings(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);

    const now = new Date();

    // ✅ OPTIMIZED: Single query with joins instead of N+1
    const rawBookings = await this.prisma.booking.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        isDemo: true,
        tokensCharged: true,
        createdAt: true,
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            user: { select: { name: true, email: true } },
          },
        },
        tokenLedger: {
          where: { paymentId: { not: null } },
          select: {
            payment: {
              select: {
                id: true,
                amountInMinor: true,
                currency: true,
                status: true,
                createdAt: true,
                providerOrderId: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    // ✅ Map data (no additional queries needed)
    const enriched = rawBookings.map((b) => {
      const payment = b.tokenLedger[0]?.payment
        ? {
            ...b.tokenLedger[0].payment,
            amountInMinor: toNum(b.tokenLedger[0].payment.amountInMinor),
          }
        : null;

      return {
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        isDemo: b.isDemo,
        createdAt: b.createdAt,
        tokensCharged: toNum(b.tokensCharged),
        tutor: {
          id: b.tutor.id,
          hourlyRate: b.tutor.hourlyRate,
          name: b.tutor.user?.name,
          email: b.tutor.user?.email,
        },
        payment,
      };
    });

    const unscheduled = enriched.filter(
      (b) => b.status === 'PENDING' || b.status === 'PENDING_SLOT',
    );

    const upcoming = enriched.filter(
      (b) =>
        b.status === 'CONFIRMED' &&
        b.startTime &&
        new Date(b.startTime) > now,
    );

    const completed = enriched.filter(
      (b) =>
        b.status === 'COMPLETED' ||
        (b.endTime && new Date(b.endTime) < now),
    );

    return { unscheduled, upcoming, completed, all: enriched };
  }

  // -------- Other existing methods --------

  async listAll(params: { page?: number; pageSize?: number; q?: string }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const q = params.q?.trim();
    const where: Prisma.StudentWhereInput = q
      ? {
          OR: [
            {
              user: {
                email: {
                  contains: q,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
            {
              grade: {
                contains: q,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        }
      : {};

    const [itemsRaw, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          grade: true,
          tokens: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    const items = itemsRaw.map((s) => ({ ...s, tokens: toNum(s.tokens) }));

    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getByIdAdmin(studentId: string) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        grade: true,
        tokens: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true } },
      },
    });

    if (!s) throw new NotFoundException('Student not found');

    return { ...s, tokens: toNum(s.tokens) };
  }

  async getTokenBalance(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);
    
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { tokens: true },
    });

    if (!s) throw new NotFoundException('Student profile not found');

    return { tokens: toNum(s.tokens ?? 0) };
  }

  async getTokenLedger(userId: string, page = 1, pageSize = 20) {
    const studentId = await this.ensureStudentProfile(userId);

    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const skip = (safePage - 1) * safePageSize;

    const [itemsRaw, total] = await this.prisma.$transaction([
      this.prisma.tokenLedger.findMany({
        where: { studentId },
        skip,
        take: safePageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          delta: true,
          reason: true,
          bookingId: true,
          paymentId: true,
          createdAt: true,
        },
      }),
      this.prisma.tokenLedger.count({ where: { studentId } }),
    ]);

    const items = itemsRaw.map((it) => ({ ...it, delta: toNum(it.delta) }));

    return {
      items,
      meta: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  async getPayments(userId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const skip = (safePage - 1) * safePageSize;

    const [itemsRaw, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: { userId },
        skip,
        take: safePageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          amountInMinor: true,
          currency: true,
          status: true,
          createdAt: true,
          providerOrderId: true,
        },
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);

    const items = itemsRaw.map((p) => ({
      ...p,
      amountInMinor: toNum(p.amountInMinor),
    }));

    return {
      items,
      meta: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  async verifyTokenInvariant(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tokens: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const agg = await this.prisma.tokenLedger.aggregate({
      where: { studentId },
      _sum: { delta: true },
    });

    const sum = toNum(agg._sum.delta ?? 0);
    const tokens = toNum(student.tokens);

    return {
      tokensField: tokens,
      sumOfLedger: sum,
      ok: sum === tokens,
    };
  }

  // -------- Tutor: Get my students from bookings --------
  async getTutorStudents(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tutor) throw new NotFoundException('Tutor profile not found');

    // Get distinct students from bookings
    const bookings = await this.prisma.booking.findMany({
      where: { tutorId: tutor.id },
      select: {
        student: {
          select: {
            id: true,
            grade: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      distinct: ['studentId'],
    });

    return bookings.map((b) => ({
      id: b.student.id,
      name: b.student.user?.name,
      email: b.student.user?.email,
      grade: b.student.grade,
      user: b.student.user,
    }));
  }

  async getTutorTokenBalances(userId: string, studentId?: string) {
    // Use studentId from JWT if available, otherwise ensure profile exists
    const studentIdToUse = studentId || await this.ensureStudentProfile(userId);

    const balances = await this.prisma.tutorTokenBalance.findMany({
      where: { 
        studentId: studentIdToUse,
        balance: { gt: 0 }, // Only fetch non-zero balances
      },
      select: {
        id: true,
        tutorId: true,
        balance: true,
        pricePerToken: true,
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            user: {
              select: {
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { balance: 'desc' },
      take: 50, // Limit to top 50 tutors
    });

    return balances.map((b) => ({
      ...b,
      balance: toNum(b.balance),
      pricePerToken: toNum(b.pricePerToken),
      tutor: {
        ...b.tutor,
        hourlyRate: toNum(b.tutor.hourlyRate),
      },
    }));
  }

  async getTokenLedgerAll(userId: string, studentId?: string) {
    // Use studentId from JWT if available, otherwise ensure profile exists
    const studentIdToUse = studentId || await this.ensureStudentProfile(userId);

    const ledger = await this.prisma.tokenLedger.findMany({
      where: { studentId: studentIdToUse },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        studentId: true,
        tutorId: true,
        delta: true,
        reason: true,
        createdAt: true,
        tutor: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return ledger.map((l) => ({
      ...l,
      delta: toNum(l.delta),
    }));
  }
}
