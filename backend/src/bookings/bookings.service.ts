import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { addMinutes, isBefore, differenceInMinutes } from 'date-fns';
import { Prisma, BookingStatus, TokenReason } from '@prisma/client';
import { toUtc, fromUtc } from '../common/time.util';
import { NotificationsService } from '../notifications/notifications.service';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';

const TOKENS_PER_HOUR = Number(process.env.TOKENS_PER_HOUR ?? 1);
const MIN_BLOCK_MINUTES = 15;
const FEE_PERCENT = Number(process.env.FEE_PERCENT ?? 20);

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ---------- utils ----------
  private requiredTokens(start: Date, end: Date, tokensPerHour: number): number {
    const mins = Math.max(0, differenceInMinutes(end, start));
    const blocks = Math.ceil(mins / MIN_BLOCK_MINUTES);
    const tokensPerBlock = tokensPerHour / (60 / MIN_BLOCK_MINUTES);
    return Math.ceil(blocks * tokensPerBlock);
  }

  private suggestPacks(needed: number): number[] {
    const presets = [20, 50, 100];
    const firstBigEnough = presets.find((p) => p >= needed) ?? presets[presets.length - 1];
    const unique = Array.from(new Set<number>([firstBigEnough, ...presets]));
    return unique.slice(0, 3);
  }

  private async ensureNoTutorOverlap(tutorId: string, start: Date, end: Date, excludeId?: string) {
    const overlap = await this.prisma.booking.findFirst({
      where: {
        tutorId,
        id: excludeId ? { not: excludeId } : undefined,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.PENDING_SLOT],
        },
        startTime: { lt: end, not: null },
        endTime: { gt: start, not: null },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('Tutor is not available for this time.');
  }

  private async ensureNoStudentOverlap(studentId: string, start: Date, end: Date, excludeId?: string) {
    const overlap = await this.prisma.booking.findFirst({
      where: {
        studentId,
        id: excludeId ? { not: excludeId } : undefined,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.PENDING_SLOT],
        },
        startTime: { lt: end, not: null },
        endTime: { gt: start, not: null },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('You already have a booking overlapping this time.');
  }

  private async ensureWithinAvailabilitySlot(tutorId: string, start: Date, end: Date) {
    const slot = await this.prisma.availabilitySlot.findFirst({
      where: { tutorId, startTime: { lte: start }, endTime: { gte: end } },
      select: { id: true },
    });
    if (!slot) throw new BadRequestException('Selected time is outside the tutor’s availability.');
  }

  // ---------- demo helpers ----------
  async hasUsedDemo(studentUserId: string, tutorId: string): Promise<boolean> {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true },
    });
    if (!student) return false;
    return this.hasUsedDemoByStudentId(student.id, tutorId);
  }

  private async hasUsedDemoByStudentId(studentId: string, tutorId: string): Promise<boolean> {
    const demo = await this.prisma.booking.findFirst({
      where: {
        studentId,
        tutorId,
        isDemo: true,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
      },
      select: { id: true },
    });
    return !!demo;
  }

  // ---------- queries ----------
  async nextForStudent(studentId: string) {
    return this.prisma.booking.findFirst({
      where: { studentId, status: BookingStatus.CONFIRMED, startTime: { gt: new Date() } },
      orderBy: { startTime: 'asc' },
    });
  }

  async list(q: QueryBookingDto, tz: string = 'UTC') {
    const rows = await this.prisma.booking.findMany({
      where: {
        tutorId: q.tutorId || undefined,
        studentId: q.studentId || undefined,
        status: (q.status as BookingStatus) || undefined,
      },
      orderBy: { startTime: 'desc' },
    });

    if (!tz || tz === 'UTC') return rows;

    return rows.map((b) => ({
      ...b,
      startLocal: b.startTime ? fromUtc(b.startTime, tz).iso : null,
      endLocal: b.endTime ? fromUtc(b.endTime, tz).iso : null,
    }));
  }

  // ---------- mutations ----------
  async create(dto: CreateBookingDto, tz?: string, actorUserId?: string) {
    const isDemo = !!dto.isDemo;

    if (actorUserId && !dto.studentId) {
      const st = await this.prisma.student.findUnique({ where: { userId: actorUserId } });
      if (!st) throw new BadRequestException('Student profile not found for current user.');
      dto.studentId = st.id;
    }
    if (!dto.studentId) throw new BadRequestException('studentId is required');

    const tutor = await this.prisma.tutor.findUnique({
      where: { id: dto.tutorId },
      select: { status: true },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');
    if (tutor.status !== 'APPROVED') throw new BadRequestException('Tutor is not approved.');

    // ---- DEMO booking ----
    if (isDemo) {
      const used = await this.hasUsedDemoByStudentId(dto.studentId!, dto.tutorId);
      if (used) throw new ConflictException('Demo already used with this tutor.');

      if (dto.startTime && dto.endTime) {
        const start = toUtc(dto.startTime, tz);
        const end = toUtc(dto.endTime, tz);

        if (!isBefore(start, end)) throw new BadRequestException('startTime must be before endTime.');
        if (isBefore(end, addMinutes(start, MIN_BLOCK_MINUTES))) {
          throw new BadRequestException(`Minimum booking is ${MIN_BLOCK_MINUTES} minutes.`);
        }

        await this.ensureWithinAvailabilitySlot(dto.tutorId, start, end);
        await this.ensureNoTutorOverlap(dto.tutorId, start, end);
        await this.ensureNoStudentOverlap(dto.studentId!, start, end);

        return this.prisma.booking.create({
          data: {
            tutorId: dto.tutorId,
            studentId: dto.studentId!,
            startTime: start,
            endTime: end,
            isDemo: true,
            status: BookingStatus.CONFIRMED,
            tokensCharged: new Prisma.Decimal(0),
            notes: dto.notes,
          },
        });
      }

      return this.prisma.booking.create({
        data: {
          tutorId: dto.tutorId,
          studentId: dto.studentId!,
          isDemo: true,
          status: BookingStatus.PENDING,
          tokensCharged: new Prisma.Decimal(0),
          notes: dto.notes,
        },
      });
    }

    // ---- Paid booking ----
    if (!dto.startTime || !dto.endTime) {
      // allow booking without slot selection
      return this.prisma.booking.create({
        data: {
          tutorId: dto.tutorId,
          studentId: dto.studentId!,
          isDemo: false,
          status: BookingStatus.PENDING_SLOT,
          tokensCharged: new Prisma.Decimal(0),
          notes: dto.notes,
        },
      });
    }

    const start = toUtc(dto.startTime, tz);
    const end = toUtc(dto.endTime, tz);

    if (!isBefore(start, end)) throw new BadRequestException('startTime must be before endTime.');
    if (isBefore(end, addMinutes(start, MIN_BLOCK_MINUTES))) {
      throw new BadRequestException(`Minimum booking is ${MIN_BLOCK_MINUTES} minutes.`);
    }

    await this.ensureWithinAvailabilitySlot(dto.tutorId, start, end);
    await this.ensureNoTutorOverlap(dto.tutorId, start, end);
    await this.ensureNoStudentOverlap(dto.studentId!, start, end);

    const cost = this.requiredTokens(start, end, TOKENS_PER_HOUR);

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { id: dto.studentId } });
      if (!student) throw new NotFoundException('Student not found');

      if (student.tokens < cost) {
        const neededTokens = cost - student.tokens;
        throw new HttpException(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Need more tokens to confirm this booking.',
            costTokens: cost,
            balanceTokens: student.tokens,
            neededTokens,
            suggestedPacks: this.suggestPacks(neededTokens),
          },
          HttpStatus.CONFLICT,
        );
      }

      const booking = await tx.booking.create({
        data: {
          tutorId: dto.tutorId,
          studentId: dto.studentId!,
          startTime: start,
          endTime: end,
          isDemo: false,
          status: BookingStatus.CONFIRMED,
          tokensCharged: new Prisma.Decimal(cost),
          notes: dto.notes,
        },
      });

      await tx.student.update({
        where: { id: student.id },
        data: { tokens: { decrement: cost } },
      });

      await tx.tokenLedger.create({
        data: {
          studentId: student.id,
          tutorId: dto.tutorId,
          delta: new Prisma.Decimal(-cost),
          reason: TokenReason.BOOKING,
          bookingId: booking.id,
        },
      });

      return booking;
    });
  }

  // ---------- Assign slot ----------
  async assignSlot(
    bookingId: string,
    dto: { startTime: string; endTime: string; notes?: string },
    tz?: string,
  ) {
    const start = toUtc(dto.startTime, tz);
    const end = toUtc(dto.endTime, tz);

    if (!isBefore(start, end)) throw new BadRequestException('startTime must be before endTime.');
    if (isBefore(end, addMinutes(start, MIN_BLOCK_MINUTES))) {
      throw new BadRequestException(`Minimum booking is ${MIN_BLOCK_MINUTES} minutes.`);
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const allowed: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.PENDING_SLOT];
    if (!allowed.includes(booking.status)) {
      throw new BadRequestException('Booking is not pending slot assignment.');
    }

    await this.ensureWithinAvailabilitySlot(booking.tutorId, start, end);
    await this.ensureNoTutorOverlap(booking.tutorId, start, end, booking.id);
    await this.ensureNoStudentOverlap(booking.studentId, start, end, booking.id);

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        startTime: start,
        endTime: end,
        notes: dto.notes ?? booking.notes,
        status: BookingStatus.CONFIRMED,
      },
    });
  }

  // ---------- RESCHEDULE ----------
  async reschedule(
    id: string,
    dto: RescheduleBookingDto,
    tz: string | undefined,
    actorUserId: string,
  ) {
    const start = toUtc(dto.startTime, tz);
    const end = toUtc(dto.endTime, tz);

    if (!(start < end)) throw new BadRequestException('startTime must be before endTime.');
    if (end.getTime() - start.getTime() < MIN_BLOCK_MINUTES * 60_000) {
      throw new BadRequestException(`Minimum booking is ${MIN_BLOCK_MINUTES} minutes.`);
    }

    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        tutor: { select: { id: true, userId: true } },
        student: { select: { id: true, userId: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');

    if (b.student.userId !== actorUserId) {
      throw new ForbiddenException('Only the student can reschedule this booking.');
    }
    if (b.status === BookingStatus.CANCELED || b.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot reschedule a completed or canceled booking.');
    }
    if (!b.startTime || !b.endTime || b.status === BookingStatus.PENDING) {
      throw new BadRequestException('This booking is not scheduled yet.');
    }

    const already = await this.prisma.reminder.findFirst({
      where: { bookingId: b.id, kind: 'RESCHEDULED' },
      select: { id: true },
    });
    if (already) {
      throw new BadRequestException('You have already used your one-time edit for this booking.');
    }

    await this.ensureWithinAvailabilitySlot(b.tutor.id, start, end);
    await this.ensureNoTutorOverlap(b.tutor.id, start, end, b.id);
    await this.ensureNoStudentOverlap(b.student.id, start, end, b.id);

    const updated = await this.prisma.booking.update({
      where: { id: b.id },
      data: {
        startTime: start,
        endTime: end,
        status: BookingStatus.CONFIRMED,
      },
    });

    await this.prisma.reminder.create({ data: { bookingId: b.id, kind: 'RESCHEDULED' } });

    return updated;
  }

  // ---------- update ----------
  async update(id: string, dto: UpdateBookingDto) {
    const exists = await this.prisma.booking.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Booking not found');

    const data: Prisma.BookingUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.booking.update({ where: { id }, data });
  }

  // ---------- complete ----------
  async complete(id: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id },
        include: {
          tutor: { select: { userId: true, id: true } },
          student: { select: { userId: true, id: true } },
        },
      });
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status === BookingStatus.CANCELED) {
        throw new BadRequestException('Cannot complete a canceled booking.');
      }
      if (actorUserId) {
        const allowed = actorUserId === b.tutor.userId || actorUserId === b.student.userId;
        if (!allowed) throw new ForbiddenException('You cannot complete this booking.');
      }
      if (b.status === BookingStatus.COMPLETED) return b;

      const updated = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.COMPLETED },
      });

      if (!b.isDemo && Number(b.tokensCharged) > 0) {
        const tokens = Number(b.tokensCharged);
        const tutorShare = Math.max(0, (tokens * (100 - FEE_PERCENT)) / 100);

        await tx.tutorWallet.upsert({
          where: { tutorId: b.tutor.id },
          update: { balance: { increment: tutorShare } },
          create: { tutorId: b.tutor.id, balance: new Prisma.Decimal(tutorShare) },
        });

        await tx.tutorWalletLedger.create({
          data: {
            tutorId: b.tutor.id,
            bookingId: b.id,
            delta: new Prisma.Decimal(tutorShare),
            reason: 'BOOKING_EARNED',
            note: `Share for booking ${b.id}`,
          },
        });
      }

      return updated;
    });
  }

  // ---------- cancel ----------
  async cancel(id: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: {
          tutor: { select: { userId: true, id: true } },
          student: { select: { userId: true, id: true } },
        },
      });
      if (!booking) throw new NotFoundException('Booking not found');

      if (actorUserId) {
        const allowed = actorUserId === booking.tutor.userId || actorUserId === booking.student.userId;
        if (!allowed) throw new ForbiddenException('You cannot cancel this booking.');
      }

      if (booking.status === BookingStatus.CANCELED) return booking;

      const updated = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELED },
      });

      if (!booking.isDemo) {
        const agg = await tx.tokenLedger.aggregate({
          where: { bookingId: id, reason: TokenReason.BOOKING },
          _sum: { delta: true },
        });

        const charged = Math.abs(Number(agg._sum.delta ?? 0));
        if (charged > 0) {
          await tx.student.update({
            where: { id: booking.student.id },
            data: { tokens: { increment: charged } },
          });

          await tx.tokenLedger.create({
            data: {
              studentId: booking.student.id,
              tutorId: booking.tutor.id,
              delta: new Prisma.Decimal(charged),
              reason: TokenReason.REFUND,
              bookingId: booking.id,
            },
          });
        }
      }

      return updated;
    });
  }
}
