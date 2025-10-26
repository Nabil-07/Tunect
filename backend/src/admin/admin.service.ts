import { Prisma, BookingStatus, PaymentStatus, TutorStatus, TokenReason, KycStatus } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from './dto/pagination.dto';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';
import { TokenLedgerService } from '../tokens/token-ledger.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private ledger: TokenLedgerService,
  ) {}

  // ---------- Dashboard ----------
  async dashboard() {
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
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.tutor.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
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
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
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
}
