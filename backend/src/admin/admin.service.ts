import { Prisma, PrismaPromise, BookingStatus, PaymentStatus, TutorStatus, TokenReason, KycStatus } from '@prisma/client';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from './dto/pagination.dto';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';
import { TokenLedgerService } from '../tokens/token-ledger.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly cacheTtlMs = 30_000;

  constructor(
    private prisma: PrismaService,
    private ledger: TokenLedgerService,
  ) {}

  private getFromCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.logger.debug(`cache hit: ${key}`);
    return entry.value as T;
  }

  private setCache(key: string, value: unknown) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  // ---------- Dashboard ----------
  async dashboard() {
    const cacheKey = 'GET /admin/dashboard';
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const [users, tutors, students, bookings, payments, revenueMinor] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.tutor.count(),
      this.prisma.student.count(),
      this.prisma.booking.count(),
      this.prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amountInMinor: true },
      }),
    ]);

    const latestSignups = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' }, // or 'desc' if you prefer newest first
      take: 10,
      select: { id: true, email: true, role: true, createdAt: true },
    });

    const pendingKyc = await this.prisma.kycDocument.count({
      where: { status: KycStatus.PENDING },
    });

    return {
      totals: {
        users, tutors, students, bookings, payments,
        revenueInMinor: revenueMinor._sum.amountInMinor ?? 0,
      },
      latestSignups,
      pendingKyc,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------- Lists with pagination ----------
  private paginate(q: PaginationDto) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.min(100, Math.max(q.pageSize ?? 20, 1));
    const skip = (page - 1) * pageSize;
    return { page, pageSize, skip };
  }

  async listUsers(q: PaginationDto) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.UserWhereInput | undefined = q.q
      ? { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } }
      : undefined;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async listTutors(q: PaginationDto & { status?: TutorStatus }) {
    const cacheKey = `GET /admin/tutors ${JSON.stringify(q || {})}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.TutorWhereInput | undefined = (() => {
      const w: Prisma.TutorWhereInput = {};
      if (q.status) w.status = q.status;
      if (q.q) {
        w.OR = [
          { bio: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
          { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } },
        ];
      }
      return Object.keys(w).length ? w : undefined;
    })();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tutor.findMany({
        where, skip, take: pageSize, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, bio: true, hourlyRate: true, status: true, subjects: true, createdAt: true,
          user: { select: { id: true, email: true, isBanned: true, bannedScope: true, bannedAt: true } },
        },
      }),
      this.prisma.tutor.count({ where }),
    ]);

    const tutorUserIds = items.map((t) => t.user.id);
    const strikeCounts = tutorUserIds.length
      ? await this.prisma.piiViolationLog.groupBy({
          by: ['userId'],
          where: { userId: { in: tutorUserIds } },
          _count: { _all: true },
        })
      : [];
    const strikeMap = new Map(strikeCounts.map((row) => [row.userId, row._count._all]));

    const enriched = items.map((item) => ({
      ...item,
      user: {
        ...item.user,
        piiStrikes: strikeMap.get(item.user.id) ?? 0,
        piiMaxStrikes: 3,
      },
    }));

    const result = { items: enriched, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    this.setCache(cacheKey, result);
    return result;
  }

  async setTutorStatus(tutorId: string, dto: SetTutorStatusDto) {
    const t = await this.prisma.tutor.findUnique({ where: { id: tutorId }, select: { id: true } });
    if (!t) throw new NotFoundException('Tutor not found');
    return this.prisma.tutor.update({
      where: { id: tutorId },
      data: { status: dto.status },
      select: { id: true, status: true, updatedAt: true },
    });
  }

  async listStudents(q: PaginationDto) {
    const cacheKey = `GET /admin/students ${JSON.stringify(q || {})}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.StudentWhereInput | undefined = q.q
      ? {
          OR: [
            { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } },
            { grade: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : undefined;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: {
          id: true, grade: true, tokens: true, createdAt: true,
          user: { select: { id: true, email: true, isBanned: true, bannedScope: true, bannedAt: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    const studentUserIds = items.map((s) => s.user.id);
    const studentStrikeCounts = studentUserIds.length
      ? await this.prisma.piiViolationLog.groupBy({
          by: ['userId'],
          where: { userId: { in: studentUserIds } },
          _count: { _all: true },
        })
      : [];
    const studentStrikeMap = new Map(studentStrikeCounts.map((row) => [row.userId, row._count._all]));

    const enriched = items.map((item) => ({
      ...item,
      user: {
        ...item.user,
        piiStrikes: studentStrikeMap.get(item.user.id) ?? 0,
        piiMaxStrikes: 3,
      },
    }));

    const result = { items: enriched, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    this.setCache(cacheKey, result);
    return result;
  }

  async listBookings(q: PaginationDto & { status?: BookingStatus }) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.BookingWhereInput | undefined = (() => {
      const w: Prisma.BookingWhereInput = {};
      if (q.status) w.status = q.status;
      if (q.q) {
        w.OR = [
          { tutor: { is: { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } } } },
          { student: { is: { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } } } },
        ];
      }
      return Object.keys(w).length ? w : undefined;
    })();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where, skip, take: pageSize, orderBy: { startTime: 'desc' },
        select: {
          id: true, startTime: true, endTime: true, status: true, isDemo: true, createdAt: true,
          tutor: { select: { id: true, user: { select: { email: true } } } },
          student: { select: { id: true, user: { select: { email: true } } } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async listPayments(q: PaginationDto & { status?: PaymentStatus }) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.PaymentWhereInput | undefined = (() => {
      const w: Prisma.PaymentWhereInput = {};
      if (q.status) w.status = q.status;
      if (q.q) w.user = { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } };
      return Object.keys(w).length ? w : undefined;
    })();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: {
          id: true, userId: true, amountInMinor: true, currency: true, tokensPurchased: true,
          status: true, provider: true, providerOrderId: true, providerPaymentId: true, createdAt: true,
          user: { select: { email: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  // ---------- Manual token adjustment ----------
  async adjustTokens(dto: AdjustTokensDto) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true, tokens: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (dto.amount === 0) throw new BadRequestException('Amount cannot be zero');

    // Update student balance
    await this.prisma.student.update({
      where: { id: student.id },
      data: { tokens: { increment: dto.amount } },
    });

    // Ledger entry (positive = credit, negative = debit)
    await this.prisma.tokenLedger.create({
      data: {
        studentId: student.id,
        delta: dto.amount, // Prisma Decimal handled by client
        reason: TokenReason.ADMIN_ADJUSTMENT,
        paymentId: null,
        bookingId: null,
      },
    });

    return { ok: true };
  }

  async unbanUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Reduce strikes by one (if any) so the user has room for another warning
    const latestViolation = await this.prisma.piiViolationLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const operations: PrismaPromise<any>[] = [
      this.prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          bannedScope: null,
          bannedAt: null,
        },
      }),
      this.prisma.banLedger.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
          liftedAt: new Date(),
          liftReason: 'ADMIN_UNBAN',
        },
      }),
    ];

    if (latestViolation) {
      operations.push(
        this.prisma.piiViolationLog.delete({ where: { id: latestViolation.id } }),
      );
    }

    await this.prisma.$transaction(operations);

    return { ok: true, message: 'User has been unbanned successfully', strikesCleared: latestViolation ? 1 : 0 };
  }
}
