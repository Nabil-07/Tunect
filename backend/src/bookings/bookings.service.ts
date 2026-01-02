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
import { CreateGroupBookingDto, JoinGroupBookingDto } from './dto/group-booking.dto';
import { addMinutes, isBefore, differenceInMinutes, differenceInHours } from 'date-fns';
import { Prisma, BookingStatus, TokenReason } from '@prisma/client';
import { toUtc, fromUtc } from '../common/time.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { GoogleMeetService } from '../google-meet/google-meet.service';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { ChatTriggersService } from '../messages/chat-triggers.service';

const TOKENS_PER_HOUR = Number(process.env.TOKENS_PER_HOUR ?? 1);
const MIN_BLOCK_MINUTES = 15;
const FEE_PERCENT = Number(process.env.FEE_PERCENT ?? 20);

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private googleMeet: GoogleMeetService,
    private waitlistService: WaitlistService,
    private chatTriggers: ChatTriggersService,
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

        // If requested window is not within availability or overlaps, add to waitlist
        try {
          await this.ensureWithinAvailabilitySlot(dto.tutorId, start, end);
          await this.ensureNoTutorOverlap(dto.tutorId, start, end);
        } catch (e) {
          // Add to waitlist and create a demo booking awaiting slot selection
          await this.waitlistService.addToWaitlist(
            {
              tutorId: dto.tutorId,
              requestedStartTime: start.toISOString(),
              requestedEndTime: end.toISOString(),
              subject: undefined,
              notes: dto.notes,
              priority: 1,
            },
            dto.studentId!,
          );

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
        await this.ensureNoStudentOverlap(dto.studentId!, start, end);

        // Cancel any pending demo bookings for this student-tutor pair
        await this.prisma.booking.updateMany({
          where: {
            studentId: dto.studentId!,
            tutorId: dto.tutorId,
            isDemo: true,
            status: BookingStatus.PENDING,
          },
          data: { status: BookingStatus.CANCELED },
        });

        const booking = await this.prisma.booking.create({
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
          include: {
            student: { select: { userId: true } },
            tutor: { select: { userId: true } },
          },
        });

        // Create direct chat conversation
        try {
          await this.chatTriggers.onDirectBookingCreated(
            booking.id,
            booking.tutor.userId,
            booking.student.userId,
          );
        } catch (error) {
          console.error('Failed to create chat conversation:', error);
        }

        return booking;
      }

      // No specific time chosen: add to waitlist for generic notification
      // Before creating another PENDING demo, check if one already exists for this tutor
      const existingDemo = await this.prisma.booking.findFirst({
        where: {
          tutorId: dto.tutorId,
          studentId: dto.studentId!,
          isDemo: true,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingDemo) {
        // If already CONFIRMED or PENDING, do not create duplicates; return existing
        return existingDemo;
      }

      await this.waitlistService.addToWaitlist(
        {
          tutorId: dto.tutorId,
          requestedStartTime: new Date().toISOString(),
          requestedEndTime: addMinutes(new Date(), MIN_BLOCK_MINUTES).toISOString(),
          subject: undefined,
          notes: dto.notes,
          priority: 1,
        },
        dto.studentId!,
      );

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
        include: {
          student: { select: { userId: true } },
          tutor: { select: { userId: true } },
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

      // Create direct chat conversation
      try {
        await this.chatTriggers.onDirectBookingCreated(
          booking.id,
          booking.tutor.userId,
          booking.student.userId,
        );
      } catch (error) {
        console.error('Failed to create chat conversation:', error);
      }

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

    const booking = await this.prisma.booking.findUnique({ 
      where: { id: bookingId },
      include: {
        tutor: { include: { user: true } },
        student: { include: { user: true } },
      }
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const allowed: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.PENDING_SLOT];
    if (!allowed.includes(booking.status)) {
      throw new BadRequestException('Booking is not pending slot assignment.');
    }

    await this.ensureWithinAvailabilitySlot(booking.tutorId, start, end);
    await this.ensureNoTutorOverlap(booking.tutorId, start, end, booking.id);
    await this.ensureNoStudentOverlap(booking.studentId, start, end, booking.id);

    // ✅ For PENDING_SLOT (paid booking without slot), deduct tokens now if not already charged
    const isPendingSlot = booking.status === BookingStatus.PENDING_SLOT;
    const alreadyCharged = Number(booking.tokensCharged) > 0;
    
    if (isPendingSlot && !alreadyCharged) {
      const cost = this.requiredTokens(start, end, TOKENS_PER_HOUR);
      
      // Check tutor-specific token balance
      const balance = await this.prisma.tutorTokenBalance.findUnique({
        where: {
          studentId_tutorId: {
            studentId: booking.studentId,
            tutorId: booking.tutorId,
          },
        },
      });
      
      if (!balance || Number(balance.balance) < cost) {
        throw new BadRequestException(
          `Insufficient tokens for this tutor. Need ${cost}, have ${balance?.balance || 0}`
        );
      }

      await this.prisma.$transaction(async (tx) => {
        // Deduct from tutor-specific balance
        await tx.tutorTokenBalance.update({
          where: {
            studentId_tutorId: {
              studentId: booking.studentId,
              tutorId: booking.tutorId,
            },
          },
          data: { balance: { decrement: cost } },
        });

        // Deduct from global student tokens
        await tx.student.update({
          where: { id: booking.studentId },
          data: { tokens: { decrement: cost } },
        });

        // Create ledger entry
        await tx.tokenLedger.create({
          data: {
            studentId: booking.studentId,
            tutorId: booking.tutorId,
            bookingId: booking.id,
            delta: new Prisma.Decimal(-cost),
            reason: TokenReason.BOOKING,
          },
        });

        // Update booking with time and tokens
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            startTime: start,
            endTime: end,
            notes: dto.notes ?? booking.notes,
            status: BookingStatus.CONFIRMED,
            tokensCharged: new Prisma.Decimal(cost),
          },
        });
      });
    } else {
      // Demo or already charged - just update times
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          startTime: start,
          endTime: end,
          notes: dto.notes ?? booking.notes,
          status: BookingStatus.CONFIRMED,
        },
      });
    }

    // Fetch updated booking
    const updated = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: { include: { user: true } },
        student: { include: { user: true } },
      },
    });

    // Generate Google Meet link
    try {
      await this.googleMeet.createAndAttachMeeting(
        updated!.id,
        updated!.tutor.user.email,
        updated!.student.user.email,
        updated!.startTime!,
        updated!.endTime!,
        updated!.notes || 'Tutoring Session',
      );
    } catch (error) {
      console.error('[BookingsService] Failed to create Google Meet link:', error);
      // Don't fail the booking if Meet creation fails
    }

    return updated;
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
      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException('Cannot cancel a completed booking.');
      }

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
          let refundAmount = 0;
          let refundReason = TokenReason.REFUND;

          // Determine who is canceling
          const isTutorCanceling = actorUserId === booking.tutor.userId;
          const isStudentCanceling = actorUserId === booking.student.userId;

          if (isTutorCanceling) {
            // Tutor cancellation: 100% refund + 10% bonus
            refundAmount = Math.floor(charged * 1.1);
            refundReason = TokenReason.REFUND;
          } else if (isStudentCanceling && booking.startTime) {
            // Student cancellation: time-based refund
            // ✅ NEW POLICY: 48hrs+ = 100%, 24-48hrs = 50%, <24hrs = 0%
            const now = new Date();
            const start = booking.startTime;
            const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

            // No refund for group sessions (student cancellation)
            if (booking.isGroupSession) {
              refundAmount = 0;
            } else if (hoursUntilStart >= 48) {
              // 48+ hours before: 100% refund
              refundAmount = charged;
            } else if (hoursUntilStart >= 24) {
              // 24-48 hours before: 50% refund
              refundAmount = Math.floor(charged * 0.5);
            } else {
              // Less than 24 hours: No refund
              refundAmount = 0;
            }
          } else if (!booking.startTime) {
            // Booking without slot (PENDING or PENDING_SLOT): full refund
            refundAmount = charged;
          }

          if (refundAmount > 0) {
            // Update global student tokens
            await tx.student.update({
              where: { id: booking.student.id },
              data: { tokens: { increment: refundAmount } },
            });

            // Update tutor-specific token balance
            const existingBalance = await tx.tutorTokenBalance.findUnique({
              where: {
                studentId_tutorId: {
                  studentId: booking.student.id,
                  tutorId: booking.tutor.id,
                },
              },
            });

            if (existingBalance) {
              await tx.tutorTokenBalance.update({
                where: {
                  studentId_tutorId: {
                    studentId: booking.student.id,
                    tutorId: booking.tutor.id,
                  },
                },
                data: {
                  balance: { increment: refundAmount },
                },
              });
            }

            // Create ledger entry
            await tx.tokenLedger.create({
              data: {
                studentId: booking.student.id,
                tutorId: booking.tutor.id,
                delta: new Prisma.Decimal(refundAmount),
                reason: refundReason,
                bookingId: booking.id,
              },
            });
          }
        }
      }

      return updated;
    });
  }

  // ==================== GROUP SESSIONS ====================
  
  async createGroupSession(dto: CreateGroupBookingDto, creatorTutorId: string) {
    const { tutorId, startTime, endTime, subject, maxStudents, pricePerStudent, isDemo, notes } = dto;
    
    // Verify tutor creating is the same as specified tutor
    if (tutorId !== creatorTutorId) {
      throw new ForbiddenException('You can only create group sessions for yourself');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Validate time range
    if (isBefore(end, start)) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check for tutor overlap
    await this.ensureNoTutorOverlap(tutorId, start, end);

    // Verify tutor exists
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      include: { user: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Create group booking (no initial student - they will join separately)
    // For group sessions, we create a "placeholder" student booking for the tutor to manage
    const booking = await this.prisma.booking.create({
      data: {
        tutorId,
        studentId: tutor.userId, // Temporary - group sessions don't have a single student
        startTime: start,
        endTime: end,
        status: BookingStatus.CONFIRMED,
        notes: notes || `Group ${subject} session`,
        isDemo: isDemo || false,
        isGroupSession: true,
        maxStudents,
        currentEnrollment: 0,
        pricePerStudent: new Prisma.Decimal(pricePerStudent),
        tokensCharged: new Prisma.Decimal(0), // Will be calculated as students join
      },
      include: {
        tutor: { include: { user: true } },
        groupParticipants: {
          include: {
            student: { include: { user: true } },
          },
        },
      },
    });

    // Generate Google Meet link for group session
    try {
      await this.googleMeet.createAndAttachMeeting(
        booking.id,
        booking.tutor.user.email,
        booking.tutor.user.email, // Group session - tutor email for both
        booking.startTime!,
        booking.endTime!,
        booking.notes || 'Group Session',
      );
    } catch (error) {
      console.error('[BookingsService] Failed to create Google Meet link for group session:', error);
    }

    return {
      ...booking,
      spotsAvailable: maxStudents - 0,
    };
  }

  async joinGroupSession(bookingId: string, studentId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: { include: { user: true } },
        groupParticipants: {
          include: { student: { include: { user: true } } },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Group session not found');
    }

    if (!booking.isGroupSession) {
      throw new BadRequestException('This is not a group session');
    }

    if (booking.currentEnrollment >= booking.maxStudents) {
      throw new BadRequestException('Group session is full');
    }

    // Check if student already joined
    const alreadyJoined = booking.groupParticipants.some(p => p.studentId === studentId);
    if (alreadyJoined) {
      throw new BadRequestException('You have already joined this session');
    }

    // Get student with tokens
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Calculate tokens needed - GROUP SESSIONS USE 0.5 TOKENS
    const GROUP_SESSION_TOKEN_COST = 0.5;
    const tokensNeeded = GROUP_SESSION_TOKEN_COST;

    // Get student's token balance with locked-in price for this tutor
    const tokenBalance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId,
          tutorId: booking.tutorId,
        },
      },
      select: { balance: true, pricePerToken: true },
    });

    if (!tokenBalance || Number(tokenBalance.balance) < tokensNeeded) {
      throw new BadRequestException(
        `Insufficient tokens. You need ${tokensNeeded} tokens for this tutor but have ${tokenBalance?.balance || 0}`,
      );
    }

    // Transaction: charge tokens, add participant, update enrollment, add to tutor wallet
    return this.prisma.$transaction(async (tx) => {
      // Deduct 0.5 tokens from tutor-specific balance
      await tx.tutorTokenBalance.update({
        where: {
          studentId_tutorId: {
            studentId,
            tutorId: booking.tutorId,
          },
        },
        data: {
          balance: { decrement: tokensNeeded },
        },
      });

      // Also deduct from general student tokens (for display purposes)
      await tx.student.update({
        where: { id: studentId },
        data: { tokens: { decrement: tokensNeeded } },
      });

      // Create token ledger entry
      await tx.tokenLedger.create({
        data: {
          studentId,
          tutorId: booking.tutorId,
          delta: new Prisma.Decimal(-tokensNeeded),
          reason: 'BOOKING',
          bookingId: booking.id,
        },
      });

      // Calculate payout amount based on student's locked-in price
      const payoutAmount = tokensNeeded * Number(tokenBalance.pricePerToken);

      // Add to tutor wallet
      await tx.tutorWallet.upsert({
        where: { tutorId: booking.tutorId },
        update: {
          balance: { increment: payoutAmount },
        },
        create: {
          tutorId: booking.tutorId,
          balance: new Prisma.Decimal(payoutAmount),
        },
      });

      // Track in tutor wallet ledger for payout reconciliation
      await tx.tutorWalletLedger.create({
        data: {
          tutorId: booking.tutorId,
          bookingId: booking.id,
          delta: new Prisma.Decimal(payoutAmount),
          reason: 'BOOKING_CHARGE',
          note: `Group session: ${tokensNeeded} tokens × ₹${tokenBalance.pricePerToken} = ₹${payoutAmount}`,
        },
      });

      // Add participant with price tracking
      await tx.groupBookingParticipant.create({
        data: {
          bookingId: booking.id,
          studentId,
          tokensPaid: new Prisma.Decimal(tokensNeeded),
          pricePerToken: tokenBalance.pricePerToken,
          status: 'ENROLLED',
        },
      });

      // Update booking enrollment count and total tokens charged
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          currentEnrollment: { increment: 1 },
          tokensCharged: { increment: tokensNeeded },
        },
        include: {
          tutor: { include: { user: true } },
          groupParticipants: {
            include: { student: { include: { user: true } } },
          },
        },
      });

      // Send notification to student
      await this.notifications.create({
        userId: student.userId,
        type: NotificationType.BOOKING,
        title: 'Joined Group Session',
        message: `You've joined a group session with ${booking.tutor.user.name}`,
        bookingId: booking.id,
      });

      return {
        ...updated,
        spotsAvailable: updated.maxStudents - updated.currentEnrollment,
      };
    });
  }

  async leaveGroupSession(bookingId: string, studentId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        groupParticipants: {
          where: { studentId },
          include: { student: { include: { user: true } } },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Group session not found');
    }

    if (!booking.isGroupSession) {
      throw new BadRequestException('This is not a group session');
    }

    const participant = booking.groupParticipants[0];
    if (!participant) {
      throw new BadRequestException('You are not enrolled in this session');
    }

    if (participant.status === 'DROPPED') {
      throw new BadRequestException('You have already left this session');
    }

    // Check if session is too soon (e.g., within 24 hours)
    const hoursUntilSession = differenceInMinutes(booking.startTime!, new Date()) / 60;
    const refundPercentage = hoursUntilSession >= 24 ? 100 : hoursUntilSession >= 12 ? 50 : 0;
    const refundAmount = Math.floor((Number(participant.tokensPaid) * refundPercentage) / 100);

    return this.prisma.$transaction(async (tx) => {
      // Mark participant as dropped
      await tx.groupBookingParticipant.update({
        where: { id: participant.id },
        data: { status: 'DROPPED' },
      });

      // Refund tokens if applicable
      if (refundAmount > 0) {
        await tx.student.update({
          where: { id: studentId },
          data: { tokens: { increment: refundAmount } },
        });

        await tx.tokenLedger.create({
          data: {
            studentId,
            tutorId: booking.tutorId,
            delta: new Prisma.Decimal(refundAmount),
            reason: 'REFUND',
            bookingId: booking.id,
          },
        });
      }

      // Update enrollment count
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          currentEnrollment: { decrement: 1 },
          tokensCharged: { decrement: Number(participant.tokensPaid) - refundAmount },
        },
      });

      return {
        ...updated,
        refundAmount,
        refundPercentage,
      };
    });
  }

  async getGroupSessionParticipants(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        groupParticipants: {
          where: { status: 'ENROLLED' },
          include: {
            student: {
              include: { 
                user: { 
                  select: { 
                    name: true, 
                    avatarUrl: true
                    // Exclude email and student ID for privacy
                  } 
                } 
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Group session not found');
    }

    if (!booking.isGroupSession) {
      throw new BadRequestException('This is not a group session');
    }

    return {
      bookingId: booking.id,
      maxStudents: booking.maxStudents,
      currentEnrollment: booking.currentEnrollment,
      spotsAvailable: booking.maxStudents - booking.currentEnrollment,
      participants: booking.groupParticipants.map(p => ({
        id: p.id,
        studentId: p.studentId,
        name: p.student.user.name,
        avatarUrl: p.student.user.avatarUrl,
        joinedAt: p.joinedAt,
        tokensPaid: p.tokensPaid,
      })),
    };
  }

  async getAvailableGroupSessions(filters?: { subject?: string; startDate?: Date; endDate?: Date }) {
    const where: Prisma.BookingWhereInput = {
      isGroupSession: true,
      status: BookingStatus.CONFIRMED,
      startTime: {
        gte: filters?.startDate || new Date(),
        ...(filters?.endDate && { lte: filters.endDate }),
      },
    };

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        tutor: {
          include: { user: { select: { name: true, avatarUrl: true } } },
        },
        groupParticipants: {
          where: { status: 'ENROLLED' },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return bookings
      .filter(b => b.currentEnrollment < b.maxStudents) // Only show sessions with available spots
      .map(b => ({
        id: b.id,
        tutorId: b.tutorId,
        tutorName: b.tutor.user.name,
        tutorAvatar: b.tutor.user.avatarUrl,
        startTime: b.startTime,
        endTime: b.endTime,
        subject: b.notes || 'Group Session',
        maxStudents: b.maxStudents,
        currentEnrollment: b.currentEnrollment,
        spotsAvailable: b.maxStudents - b.currentEnrollment,
        pricePerStudent: b.pricePerStudent,
        isDemo: b.isDemo,
      }));
  }

  // Convert existing 1:1 slot to group session
  async convertToGroupSession(
    bookingId: string,
    tutorId: string,
    maxStudents: number,
    pricePerStudent: number,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { student: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.tutorId !== tutorId) {
      throw new ForbiddenException('You can only convert your own bookings');
    }

    // Validation: Must be >24 hours before session
    if (!booking.startTime) {
      throw new BadRequestException('Booking has no start time');
    }
    const hoursUntilSession = differenceInHours(booking.startTime, new Date());
    if (hoursUntilSession < 24) {
      throw new BadRequestException(
        'Cannot convert to group session within 24 hours of start time',
      );
    }

    // Validation: Must be an unbooked slot (PENDING_SLOT status)
    if (booking.status !== BookingStatus.PENDING_SLOT) {
      throw new BadRequestException(
        'Can only convert unbooked slots to group sessions. This slot has already been booked.',
      );
    }

    // Validation: Must not already be a group session
    if (booking.isGroupSession) {
      throw new BadRequestException('This is already a group session');
    }

    // Convert to group session
    // Note: studentId remains for the tutor who created the slot initially
    // Group participants are tracked separately in GroupBookingParticipant
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        isGroupSession: true,
        maxStudents,
        currentEnrollment: 0,
        pricePerStudent: new Prisma.Decimal(pricePerStudent),
        status: BookingStatus.PENDING, // Open for enrollment
      },
      include: {
        tutor: { include: { user: true } },
      },
    });

    return {
      ...updated,
      message: 'Successfully converted to group session',
      spotsAvailable: maxStudents,
    };
  }

  // Create a PENDING_SLOT booking by deducting tokens upfront
  async createPendingSlotWithTokens(tutorId: string, userId: string) {
    // Get student
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    // Verify tutor exists
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, hourlyRate: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Check token balance for this tutor
    const tokenBalance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId: student.id,
          tutorId,
        },
      },
      select: { balance: true, pricePerToken: true },
    });

    if (!tokenBalance || Number(tokenBalance.balance) < 1) {
      throw new BadRequestException(
        `Insufficient tokens. You need at least 1 token for this tutor but have ${tokenBalance?.balance || 0}`,
      );
    }

    // Deduct 1 token upfront to reserve the slot
    const tokensToReserve = 1;

    return this.prisma.$transaction(async (tx) => {
      // Create PENDING_SLOT booking first to get the ID
      const booking = await tx.booking.create({
        data: {
          tutorId,
          studentId: student.id,
          isDemo: false,
          status: BookingStatus.PENDING_SLOT,
          tokensCharged: new Prisma.Decimal(tokensToReserve),
        },
        include: {
          tutor: { include: { user: true } },
          student: { include: { user: true } },
        },
      });

      // Deduct tokens from tutor-specific balance
      await tx.tutorTokenBalance.update({
        where: {
          studentId_tutorId: {
            studentId: student.id,
            tutorId,
          },
        },
        data: {
          balance: { decrement: tokensToReserve },
        },
      });

      // Deduct from global student tokens
      await tx.student.update({
        where: { id: student.id },
        data: { tokens: { decrement: tokensToReserve } },
      });

      // Create token ledger entry linked to booking
      await tx.tokenLedger.create({
        data: {
          studentId: student.id,
          tutorId,
          bookingId: booking.id,
          delta: new Prisma.Decimal(-tokensToReserve),
          reason: 'BOOKING',
        },
      });

      return booking;
    });
  }

  // Bulk reserve tokens for multiple sessions
  async bulkReserveTokens(tutorId: string, userId: string, count: number) {
    if (count < 1 || count > 20) {
      throw new BadRequestException('Count must be between 1 and 20');
    }

    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Check token balance
    const tokenBalance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId: student.id,
          tutorId,
        },
      },
      select: { balance: true },
    });

    if (!tokenBalance || Number(tokenBalance.balance) < count) {
      throw new BadRequestException(
        `Insufficient tokens. You need ${count} tokens but have ${tokenBalance?.balance || 0}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Deduct tokens
      await tx.tutorTokenBalance.update({
        where: {
          studentId_tutorId: {
            studentId: student.id,
            tutorId,
          },
        },
        data: {
          balance: { decrement: count },
        },
      });

      await tx.student.update({
        where: { id: student.id },
        data: { tokens: { decrement: count } },
      });

      // Create ledger entry
      await tx.tokenLedger.create({
        data: {
          studentId: student.id,
          tutorId,
          delta: new Prisma.Decimal(-count),
          reason: 'BOOKING',
        },
      });

      // Create multiple PENDING_SLOT bookings
      const bookings = [];
      for (let i = 0; i < count; i++) {
        const booking = await tx.booking.create({
          data: {
            tutorId,
            studentId: student.id,
            isDemo: false,
            status: BookingStatus.PENDING_SLOT,
            tokensCharged: new Prisma.Decimal(1),
          },
        });
        bookings.push(booking);
      }

      return {
        count: bookings.length,
        bookings,
        message: `Successfully reserved ${count} tokens for future sessions`,
      };
    });
  }
}


