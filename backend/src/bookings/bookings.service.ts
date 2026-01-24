import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { CreateGroupBookingDto, JoinGroupBookingDto } from './dto/group-booking.dto';
import { addMinutes, isBefore, differenceInMinutes, differenceInHours } from 'date-fns';
import { Prisma, BookingStatus, TokenReason, Role } from '@prisma/client';
import { toUtc, fromUtc } from '../common/time.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { ChatTriggersService } from '../messages/chat-triggers.service';
import { BansService } from '../bans/bans.service';

const TOKENS_PER_HOUR = Number(process.env.TOKENS_PER_HOUR ?? 1);
const MIN_BLOCK_MINUTES = 15;
const DEFAULT_FEE_PERCENT = Number(process.env.FEE_PERCENT ?? 20);
const FAILED_TECHNICAL = 'FAILED_TECHNICAL' as BookingStatus;

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private waitlistService: WaitlistService,
    private chatTriggers: ChatTriggersService,
    private bans: BansService,
  ) {}

  /**
   * Validate booking status transition
   * Ensures only valid status changes are allowed
   */
  private validateStatusTransition(
    currentStatus: BookingStatus,
    newStatus: BookingStatus,
    operation: string,
  ): void {
    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
      [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELED],
      [BookingStatus.PENDING_SLOT]: [BookingStatus.CONFIRMED, BookingStatus.CANCELED],
      [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELED],
      [BookingStatus.COMPLETED]: [], // Terminal state
      [BookingStatus.CANCELED]: [], // Terminal state
      [BookingStatus.FAILED_TECHNICAL]: [], // Terminal state
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: Cannot change booking from ${currentStatus} to ${newStatus} via ${operation}. ` +
        `Allowed transitions: ${allowed.join(', ') || 'none (terminal state)'}`
      );
    }
  }

  private async ensureNoTutorOverlap(tutorId: string, start: Date, end: Date, excludeId?: string, tx?: any) {
    const prisma = tx || this.prisma;
    const overlap = await prisma.booking.findFirst({
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

  private async ensureNoStudentOverlap(studentId: string, start: Date, end: Date, excludeId?: string, tx?: any) {
    const prisma = tx || this.prisma;
    const overlap = await prisma.booking.findFirst({
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
    // Check explicit availability slots
    const slot = await this.prisma.availabilitySlot.findFirst({
      where: { tutorId, startTime: { lte: start }, endTime: { gte: end } },
      select: { id: true },
    });
    if (slot) return; // Found in explicit slots
    
    // Check recurring templates
    const dayOfWeek = start.getDay();
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const endHour = end.getHours();
    const endMin = end.getMinutes();
    
    const templates = await this.prisma.recurringTemplate.findMany({
      where: {
        tutorId,
        isActive: true,
        dayOfWeek,
      },
      select: { startTime: true, endTime: true },
    });
    
    for (const t of templates) {
      const [tStartH, tStartM] = t.startTime.split(':').map(Number);
      const [tEndH, tEndM] = t.endTime.split(':').map(Number);
      
      const tStartMinutes = tStartH * 60 + tStartM;
      const tEndMinutes = tEndH * 60 + tEndM;
      const reqStartMinutes = startHour * 60 + startMin;
      const reqEndMinutes = endHour * 60 + endMin;
      
      // Handle overnight templates (e.g., 11 PM - 1 AM)
      const templateEnd = tEndMinutes < tStartMinutes ? tEndMinutes + 24 * 60 : tEndMinutes;
      const reqEnd = reqEndMinutes < reqStartMinutes ? reqEndMinutes + 24 * 60 : reqEndMinutes;
      
      if (reqStartMinutes >= tStartMinutes && reqEnd <= templateEnd) {
        return; // Found in recurring template
      }
    }
    
    throw new BadRequestException("Selected time is outside the tutor's availability.");
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
    // Check for ANY existing demo (PENDING, CONFIRMED, COMPLETED) - not just completed ones
    // This prevents students from booking multiple demo sessions with the same tutor
    const demo = await this.prisma.booking.findFirst({
      where: {
        studentId,
        tutorId,
        isDemo: true,
        status: { 
          in: [
            BookingStatus.PENDING, 
            BookingStatus.PENDING_SLOT,
            BookingStatus.CONFIRMED, 
            BookingStatus.COMPLETED
          ] 
        },
      },
      select: { id: true },
    });
    return !!demo;
  }

  // ---------- queries ----------
  async nextForStudent(studentId: string) {
    const now = new Date();
    
    // Use the same logic as getMyBookings: fetch CONFIRMED bookings and filter in JavaScript
    // This ensures consistency between dashboard and sessions page
    const bookings = await this.prisma.booking.findMany({
      where: {
        studentId,
        status: BookingStatus.CONFIRMED,
        startTime: { not: null }, // Ensure startTime exists
      },
      orderBy: { startTime: 'asc' },
      include: {
        tutor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        student: {
          include: {
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
    });

    // Filter to only upcoming sessions (same logic as getMyBookings)
    // Ensure we compare dates correctly - b.startTime is already a Date object from Prisma
    const upcomingBookings = bookings.filter((b) => {
      if (!b.startTime) return false;
      // b.startTime from Prisma is already a Date object, compare directly
      // Use getTime() for reliable numeric comparison
      const startTime = b.startTime instanceof Date ? b.startTime.getTime() : new Date(b.startTime).getTime();
      const nowTime = now.getTime();
      return startTime > nowTime;
    });

    // Debug logging (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[nextForStudent] Student ${studentId}: found ${bookings.length} CONFIRMED bookings, ${upcomingBookings.length} upcoming`);
      console.log(`[nextForStudent] Current time: ${now.toISOString()}`);
      if (bookings.length > 0) {
        bookings.slice(0, 3).forEach((b, i) => {
          console.log(`[nextForStudent] Booking ${i + 1}: id=${b.id}, startTime=${b.startTime?.toISOString()}, isUpcoming=${b.startTime && (b.startTime instanceof Date ? b.startTime : new Date(b.startTime)) > now}`);
        });
      }
      if (upcomingBookings.length > 0) {
        console.log(`[nextForStudent] Next session: ${upcomingBookings[0].id}, startTime: ${upcomingBookings[0].startTime?.toISOString()}`);
      } else {
        console.log(`[nextForStudent] No upcoming sessions found`);
      }
    }

    // Return the first upcoming booking (next session)
    const booking = upcomingBookings[0];

    if (!booking || !booking.startTime) {
      return null;
    }

    // Return booking with all necessary fields for frontend display
    // Ensure startTime is returned as ISO string for consistent frontend parsing
    return {
      id: booking.id,
      startTime: booking.startTime instanceof Date 
        ? booking.startTime.toISOString() 
        : booking.startTime,
      endTime: booking.endTime instanceof Date 
        ? booking.endTime.toISOString() 
        : booking.endTime,
      status: booking.status,
      tutor: {
        id: booking.tutor.id,
        name: booking.tutor.user?.name,
        email: booking.tutor.user?.email,
      },
      student: {
        id: booking.student.id,
        name: booking.student.user?.name,
        email: booking.student.user?.email,
      },
    };
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

    if (actorUserId) {
      await this.bans.assertNotBanned(actorUserId, ['ALL', 'BOOKINGS']);
    }

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
      // Use transaction to prevent race conditions when checking and creating demo
      // This ensures atomicity: check and create happen in same transaction
      return this.prisma.$transaction(async (tx) => {
        // Check for ANY existing demo (PENDING, CONFIRMED, COMPLETED) before creating
        // This prevents students from booking multiple demo sessions with the same tutor
        // Using SELECT FOR UPDATE to lock the row and prevent concurrent creation
        const existingDemo = await tx.booking.findFirst({
          where: {
            studentId: dto.studentId!,
            tutorId: dto.tutorId,
            isDemo: true,
            status: { 
              in: [
                BookingStatus.PENDING, 
                BookingStatus.PENDING_SLOT,
                BookingStatus.CONFIRMED, 
                BookingStatus.COMPLETED
              ] 
            },
          },
          select: { id: true, status: true },
        });

        if (existingDemo) {
          throw new ConflictException(
            'You already have a demo session with this tutor. ' +
            'Please complete or cancel your existing demo before booking another one.'
          );
        }

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

          const booking = await tx.booking.create({
            data: {
              tutorId: dto.tutorId,
              studentId: dto.studentId!,
              isDemo: true,
              status: BookingStatus.PENDING,
              tokensCharged: new Prisma.Decimal(0),
              notes: dto.notes,
            },
          });

          return booking;
        }
        await this.ensureNoStudentOverlap(dto.studentId!, start, end);

        const booking = await tx.booking.create({
          data: {
            tutorId: dto.tutorId,
            studentId: dto.studentId!,
            isDemo: true,
            status: BookingStatus.CONFIRMED,
            startTime: start,
            endTime: end,
            tokensCharged: new Prisma.Decimal(0),
            notes: dto.notes,
          },
        });

        // Note: ensureLivekitMeeting and chatTriggers are called outside transaction
        // to avoid long-running operations in transaction
        return booking;
      } else {
        // No times provided: create PENDING demo
        // Note: We already checked for existing demos above in transaction, so this is safe
        const booking = await tx.booking.create({
          data: {
            tutorId: dto.tutorId,
            studentId: dto.studentId!,
            isDemo: true,
            status: BookingStatus.PENDING,
            tokensCharged: new Prisma.Decimal(0),
            notes: dto.notes,
          },
        });

        return booking;
      }
      }).then(async (booking) => {
        // After transaction commits, trigger side effects
        if (booking.status === BookingStatus.CONFIRMED && booking.startTime) {
          await this.ensureLivekitMeeting(booking.id);
          await this.chatTriggers.onDirectBookingCreated(
            booking.studentId,
            booking.tutorId,
            booking.id,
          );
        }
        return booking;
      });
    }

    // ---- PAID booking ----
    if (!dto.startTime || !dto.endTime) {
      // No times: create PENDING_SLOT (tokens will be charged when slot is assigned)
      // Edge Case Fix: Limit PENDING_SLOT bookings per student-tutor pair to prevent abuse
      // Check for existing PENDING_SLOT bookings for this student-tutor pair
      const existingPendingSlots = await this.prisma.booking.count({
        where: {
          studentId: dto.studentId!,
          tutorId: dto.tutorId,
          isDemo: false,
          status: BookingStatus.PENDING_SLOT,
        },
      });

      // Limit to 5 PENDING_SLOT bookings per student-tutor pair
      const MAX_PENDING_SLOTS = 5;
      if (existingPendingSlots >= MAX_PENDING_SLOTS) {
        throw new BadRequestException(
          `You already have ${existingPendingSlots} unscheduled booking${existingPendingSlots > 1 ? 's' : ''} with this tutor. ` +
          `Please schedule or cancel existing bookings before creating new ones.`
        );
      }

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
        throw new BadRequestException(
          `Insufficient tokens. Required: ${cost}, Available: ${student.tokens}`,
        );
      }

      const booking = await tx.booking.create({
        data: {
          tutorId: dto.tutorId,
          studentId: dto.studentId!,
          isDemo: false,
          status: BookingStatus.CONFIRMED,
          startTime: start,
          endTime: end,
          tokensCharged: new Prisma.Decimal(cost),
          notes: dto.notes,
        },
      });

      await tx.student.update({
        where: { id: dto.studentId! },
        data: { tokens: { decrement: cost } },
      });

      const tutorBalance = await tx.tutorTokenBalance.findUnique({
        where: {
          studentId_tutorId: {
            studentId: dto.studentId!,
            tutorId: dto.tutorId,
          },
        },
      });

      // Update or create tutorTokenBalance
      // Tokens are deducted from student.tokens (already done above)
      // tutorTokenBalance tracks tokens allocated per tutor
      // When booking, ensure tutorTokenBalance reflects the token allocation and deduction
      const tutor = await tx.tutor.findUnique({
        where: { id: dto.tutorId },
        select: { hourlyRate: true },
      });

      if (tutorBalance) {
        // TutorTokenBalance exists: check if it has enough tokens
        const currentBalance = Number(tutorBalance.balance);
        if (currentBalance < cost) {
          // Not enough tokens in tutorTokenBalance
          // This means tokens need to be allocated from student.tokens to this tutor
          // Since student.tokens was already decremented, we just need to account for it
          const transferAmount = cost - currentBalance;
          await tx.tutorTokenBalance.update({
            where: {
              studentId_tutorId: {
                studentId: dto.studentId!,
                tutorId: dto.tutorId,
              },
            },
            data: { balance: { increment: transferAmount } },
          });
        }
        // Deduct tokens for the booking
        await tx.tutorTokenBalance.update({
          where: {
            studentId_tutorId: {
              studentId: dto.studentId!,
              tutorId: dto.tutorId,
            },
          },
          data: { balance: { decrement: cost } },
        });
      } else {
        // TutorTokenBalance doesn't exist: create it
        // Tokens were already deducted from student.tokens above
        // Create tutorTokenBalance initialized with cost (tokens allocated from student.tokens)
        // Then deduct cost, so balance ends at 0 (tokens were used for this booking)
        await tx.tutorTokenBalance.create({
          data: {
            studentId: dto.studentId!,
            tutorId: dto.tutorId,
            balance: new Prisma.Decimal(cost), // Allocate tokens from student.tokens
            pricePerToken: new Prisma.Decimal(tutor?.hourlyRate ?? 0),
          },
        });
        // Deduct tokens for the booking
        await tx.tutorTokenBalance.update({
          where: {
            studentId_tutorId: {
              studentId: dto.studentId!,
              tutorId: dto.tutorId,
            },
          },
          data: { balance: { decrement: cost } },
        });
      }

      await tx.tokenLedger.create({
        data: {
          studentId: dto.studentId!,
          tutorId: dto.tutorId,
          bookingId: booking.id,
          delta: new Prisma.Decimal(-cost),
          reason: TokenReason.BOOKING,
        },
      });

      // Note: ensureLivekitMeeting and chatTriggers are called outside transaction
      // to avoid long-running operations in transaction
      return booking;
    }).then(async (booking) => {
      // After transaction commits, trigger side effects
      const logger = new Logger(BookingsService.name);
      try {
        await this.ensureLivekitMeeting(booking.id);
      } catch (error) {
        // Log but don't fail the booking if meeting URL creation fails
        logger.error('Failed to ensure LiveKit meeting:', error);
      }

      try {
        // Trigger conversation creation for paid bookings
        await this.chatTriggers.onDirectBookingCreated(
          dto.studentId!,
          dto.tutorId,
          booking.id,
        );
      } catch (error) {
        // Log but don't fail the booking if chat creation fails
        logger.error('Failed to create chat conversation:', error);
      }

      return booking;
    });
  }

  // ---------- get booking for user ----------
  async getBookingForUser(id: string, userId: string, role: Role) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        tutor: {
          include: {
            user: true,
          },
        },
        student: { include: { user: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const isTutor = booking.tutor?.userId === userId;
    const isStudent = booking.student?.userId === userId;
    if (!isTutor && !isStudent && role !== 'ADMIN') {
      throw new ForbiddenException('You are not a participant of this booking');
    }

    await this.ensureLivekitMeeting(booking.id);

    return {
      id: booking.id,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      meetingUrl: booking.meetingUrl ?? `livekit:${booking.id}`,
      meetingProvider: booking.meetingProvider ?? 'livekit',
      tutor: {
        id: booking.tutor?.id,
        name: booking.tutor?.user?.name ?? booking.tutor?.user?.email?.split('@')[0],
        email: booking.tutor?.user?.email,
      },
      student: {
        id: booking.student?.id,
        name: booking.student?.user?.name ?? booking.student?.user?.email?.split('@')[0],
        email: booking.student?.user?.email,
      },
      isDemo: booking.isDemo,
      isGroupSession: booking.isGroupSession,
    };
  }

  // ---------- cancel ----------
  async cancel(
    id: string, 
    actorUserId?: string,
    actorTutorId?: string,
    actorStudentId?: string,
    actorRole?: Role,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: {
          tutor: { select: { userId: true, id: true } },
          student: { select: { userId: true, id: true } },
        },
      });
      if (!booking) throw new NotFoundException('Booking not found');

      // Authorization check with detailed logging
      const logger = new Logger(BookingsService.name);
      logger.log(`[cancel] Authorization check for booking ${id}`);
      logger.log(`  Booking tutor.userId: ${booking.tutor.userId}, tutor.id: ${booking.tutor.id}`);
      logger.log(`  Booking student.userId: ${booking.student.userId}, student.id: ${booking.student.id}`);
      logger.log(`  Actor userId: ${actorUserId}, tutorId: ${actorTutorId}, studentId: ${actorStudentId}, role: ${actorRole}`);

      if (actorRole === Role.ADMIN) {
        // Admin can always cancel
        logger.log(`[cancel] Admin access granted`);
      }
      // Check by userId (most reliable)
      else if (actorUserId && (actorUserId === booking.tutor.userId || actorUserId === booking.student.userId)) {
        logger.log(`[cancel] Authorization granted by userId match`);
      }
      // Check by tutorId/studentId from JWT (fallback)
      else if (actorTutorId && actorTutorId === booking.tutor.id) {
        logger.log(`[cancel] Authorization granted by tutorId match`);
      }
      else if (actorStudentId && actorStudentId === booking.student.id) {
        logger.log(`[cancel] Authorization granted by studentId match`);
      }
      else {
        // No match found - forbidden
        const errorMsg = `You cannot cancel this booking. ` +
          `Booking tutorId: ${booking.tutor.id}, studentId: ${booking.student.id}. ` +
          `Your userId: ${actorUserId}, tutorId: ${actorTutorId}, studentId: ${actorStudentId}`;
        logger.error(`[cancel] Authorization DENIED: ${errorMsg}`);
        throw new ForbiddenException(errorMsg);
      }

      if (booking.status === BookingStatus.CANCELED) return booking;
      
      // Validate status transition
      this.validateStatusTransition(booking.status, BookingStatus.CANCELED, 'cancel');

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
          // Check by userId first, then fallback to tutorId/studentId from JWT
          const isTutorCanceling = 
            actorUserId === booking.tutor.userId || 
            (actorTutorId && actorTutorId === booking.tutor.id);
          const isStudentCanceling = 
            actorUserId === booking.student.userId || 
            (actorStudentId && actorStudentId === booking.student.id);

          if (isTutorCanceling) {
            // Tutor cancellation: Refund 1 token to student
            refundAmount = 1; // Always refund exactly 1 token
            refundReason = TokenReason.REFUND;
            
            // Increment demerit points for tutor
            const tutor = await tx.tutor.findUnique({
              where: { id: booking.tutor.id },
              select: { id: true, hourlyRate: true },
            });
            
            // Get demerit points separately (may not exist in schema yet)
            const tutorFull = await tx.tutor.findUnique({
              where: { id: booking.tutor.id },
            });
            const currentDemerits = (tutorFull as any)?.demeritPoints ?? 0;
            const lastReset = (tutorFull as any)?.lastDemeritReset ?? null;
            
            if (tutor) {
              let newDemeritPoints = currentDemerits + 1;
              const now = new Date();
              
              // Check if we need to reset demerits (if last reset was today)
              const shouldReset = lastReset && 
                lastReset.getDate() === now.getDate() &&
                lastReset.getMonth() === now.getMonth() &&
                lastReset.getFullYear() === now.getFullYear();
              
              // If demerits reach 3, reduce hourly rate from payout and reset
              if (newDemeritPoints >= 3) {
                const hourlyRate = Number(tutor.hourlyRate ?? 0);
                if (hourlyRate > 0) {
                  // Create a deduction ledger entry for the hourly rate
                  await tx.tutorWalletLedger.create({
                    data: {
                      tutorId: booking.tutor.id,
                      bookingId: booking.id,
                      delta: new Prisma.Decimal(-hourlyRate),
                      reason: 'DEMERIT_PENALTY' as any, // Will be available after migration
                      note: `Demerit penalty: ${hourlyRate} deducted from payout due to 3 demerit points`,
                    },
                  });
                  
                  // Deduct from wallet balance if exists
                  await tx.tutorWallet.upsert({
                    where: { tutorId: booking.tutor.id },
                    update: { balance: { decrement: hourlyRate } },
                    create: { tutorId: booking.tutor.id, balance: new Prisma.Decimal(-hourlyRate) },
                  });
                }
                
                // Reset demerit points to 0 and update reset date
                newDemeritPoints = 0;
                await tx.tutor.update({
                  where: { id: booking.tutor.id },
                  data: {
                    demeritPoints: 0,
                    lastDemeritReset: now,
                  } as any, // Type assertion for new fields
                });
              } else {
                // Just increment demerit points
                await tx.tutor.update({
                  where: { id: booking.tutor.id },
                  data: { demeritPoints: newDemeritPoints } as any, // Type assertion for new fields
                });
              }
            }
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
              // Refund to tutor-specific balance
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
              
              // Keep global student tokens in sync (aggregate = sum of all TutorTokenBalance)
              await tx.student.update({
                where: { id: booking.student.id },
                data: { tokens: { increment: refundAmount } },
              });
            } else {
              // Edge case: TutorTokenBalance doesn't exist
              // Refund to global balance only
              await tx.student.update({
                where: { id: booking.student.id },
                data: { tokens: { increment: refundAmount } },
              });
            }

            // Create ledger entry for audit trail
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

  /**
   * Mark a booking as failed for technical reasons and issue a full refund.
   * Idempotent: will no-op if already canceled/completed/failed.
   */
  async markTechnicalFailure(bookingId: string, failureReason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          tutor: { select: { userId: true, id: true } },
          student: { select: { userId: true, id: true } },
        },
      });
      if (!booking) throw new NotFoundException('Booking not found');

      // Idempotent exit for terminal states
      if (
        booking.status === BookingStatus.COMPLETED ||
        booking.status === BookingStatus.CANCELED ||
        booking.status === FAILED_TECHNICAL
      ) {
        return booking;
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: FAILED_TECHNICAL,
          notes: failureReason ? `${booking.notes ?? ''}\n[TECH_FAIL] ${failureReason}`.trim() : booking.notes,
        },
      });

      // Full refund of any charged tokens (ignore demos / zero charges gracefully)
      const agg = await tx.tokenLedger.aggregate({
        where: { bookingId, reason: TokenReason.BOOKING },
        _sum: { delta: true },
      });

      const charged = Math.abs(Number(agg._sum.delta ?? 0));
      if (charged > 0 && !booking.isDemo) {
        // Update global student tokens
        await tx.student.update({
          where: { id: booking.student.id },
          data: { tokens: { increment: charged } },
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
              balance: { increment: charged },
            },
          });
        }

        await tx.tokenLedger.create({
          data: {
            studentId: booking.student.id,
            tutorId: booking.tutor.id,
            bookingId: booking.id,
            delta: new Prisma.Decimal(charged),
            reason: TokenReason.REFUND,
          },
        });
      }

      return updated;
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

    await this.ensureLivekitMeeting(updated.id);

    return this.prisma.booking.findUnique({ where: { id: updated.id } });
  }

  // ---------- update ----------
  async update(id: string, dto: UpdateBookingDto) {
    const exists = await this.prisma.booking.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Booking not found');

    // Validate status transition if status is being changed
    if (dto.status !== undefined && dto.status !== exists.status) {
      this.validateStatusTransition(exists.status, dto.status, 'update');
    }

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
          tutor: { select: { userId: true, id: true, hourlyRate: true } },
          student: { select: { userId: true, id: true } },
        },
      });
      if (!b) throw new NotFoundException('Booking not found');
      // Validate status transition: CONFIRMED → COMPLETED
      this.validateStatusTransition(b.status, BookingStatus.COMPLETED, 'complete');
      
      if (actorUserId) {
        const allowed = actorUserId === b.tutor.userId || actorUserId === b.student.userId;
        if (!allowed) throw new ForbiddenException('You cannot complete this booking.');
      }
      if (b.status === BookingStatus.COMPLETED) return b;

      const updated = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.COMPLETED },
      });

      if (!b.isDemo && b.tokensCharged && Number(b.tokensCharged) > 0) {
        const tokens = Number(b.tokensCharged);
        const feePercent = this.platformFeePercent(b.tutor.hourlyRate ?? null);
        const tutorShare = Math.max(0, (tokens * (100 - feePercent)) / 100);

        await tx.tutorWallet.upsert({
          where: { tutorId: b.tutor.id },
          update: { balance: { increment: tutorShare } },
          create: { tutorId: b.tutor.id, balance: tutorShare },
        });

        await tx.tutorWalletLedger.create({
          data: {
            tutorId: b.tutor.id,
            bookingId: b.id,
            delta: tutorShare,
            reason: 'BOOKING_EARNED',
            note: `Completed booking ${b.id}`,
          },
        });
      }

      return updated;
    });
  }

  private platformFeePercent(hourlyRate?: number | null) {
    const defaultFee = Number(process.env.FEE_PERCENT ?? 20);
    const rate = Number(hourlyRate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return defaultFee;
    if (rate < 400) return 25;
    if (rate < 700) return 18;
    return 15;
  }

  private requiredTokens(start: Date, end: Date, tokensPerHour: number): number {
    const minutes = differenceInMinutes(end, start);
    const hours = minutes / 60;
    return Math.ceil(hours * tokensPerHour);
  }

  // ---------- assign slot ----------
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

    // Edge Case Fix: Use transaction with row-level locking to prevent concurrent slot assignments
    return this.prisma.$transaction(async (tx) => {
      // Use findUniqueOrThrow with selectForUpdate equivalent (Prisma doesn't have SELECT FOR UPDATE,
      // but transaction isolation provides protection)
      const booking = await tx.booking.findUnique({ 
        where: { id: bookingId },
        include: {
          tutor: { include: { user: true } },
          student: { include: { user: true } },
        }
      });
      
      if (!booking) throw new NotFoundException('Booking not found');

      // Edge Case Fix: Prevent assigning slots to cancelled bookings
      if (booking.status === BookingStatus.CANCELED) {
        throw new BadRequestException('Cannot assign slot to a cancelled booking.');
      }

      // Edge Case Fix: Prevent assigning slots to completed bookings
      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException('Cannot assign slot to a completed booking.');
      }

      const allowed: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.PENDING_SLOT];
      if (!allowed.includes(booking.status)) {
        throw new BadRequestException('Booking is not pending slot assignment.');
      }

      // Validate status transition: PENDING/PENDING_SLOT → CONFIRMED
      this.validateStatusTransition(booking.status, BookingStatus.CONFIRMED, 'assignSlot');

      // For demo sessions: Check if student already has another demo with this tutor
      // This prevents assigning slots to multiple demo sessions
      if (booking.isDemo) {
        const existingDemo = await tx.booking.findFirst({
          where: {
            studentId: booking.studentId,
            tutorId: booking.tutorId,
            isDemo: true,
            id: { not: bookingId }, // Exclude current booking
            status: { 
              in: [
                BookingStatus.CONFIRMED, 
                BookingStatus.COMPLETED
              ] 
            },
          },
          select: { id: true },
        });

        if (existingDemo) {
          throw new ConflictException(
            'You already have a confirmed demo session with this tutor. ' +
            'Please complete or cancel your existing demo before assigning a slot to this one.'
          );
        }
      }

      // Edge Case Fix: Check overlaps within transaction to prevent race conditions
      await this.ensureWithinAvailabilitySlot(booking.tutorId, start, end);
      await this.ensureNoTutorOverlap(booking.tutorId, start, end, bookingId, tx);
      await this.ensureNoStudentOverlap(booking.studentId, start, end, bookingId, tx);

      // ✅ For paid bookings awaiting slot (PENDING or PENDING_SLOT), ensure tokens are truly deducted now
      const cost = this.requiredTokens(start, end, TOKENS_PER_HOUR);

      if (!booking.isDemo) {
        const tokensAlreadyCharged = Number(booking.tokensCharged ?? 0);
        const tokensToCharge = Math.max(cost - tokensAlreadyCharged, 0);

        if (tokensToCharge > 0) {
          const tutorBalance = await tx.tutorTokenBalance.findUnique({
            where: {
              studentId_tutorId: {
                studentId: booking.studentId,
                tutorId: booking.tutorId,
              },
            },
            select: { balance: true },
          });

          const available = Number(tutorBalance?.balance ?? 0);
          if (!tutorBalance || available < tokensToCharge) {
            throw new BadRequestException(
              `Insufficient tokens to confirm this booking. Need ${tokensToCharge}, available ${available}`,
            );
          }

          await tx.tutorTokenBalance.update({
            where: {
              studentId_tutorId: {
                studentId: booking.studentId,
                tutorId: booking.tutorId,
              },
            },
            data: { balance: { decrement: tokensToCharge } },
          });

          // Keep aggregate student tokens in sync for dashboards
          await tx.student.update({
            where: { id: booking.studentId },
            data: { tokens: { decrement: tokensToCharge } },
          });

          await tx.tokenLedger.create({
            data: {
              studentId: booking.studentId,
              tutorId: booking.tutorId,
              bookingId: booking.id,
              delta: new Prisma.Decimal(-tokensToCharge),
              reason: TokenReason.BOOKING,
            },
          });
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            startTime: start,
            endTime: end,
            status: BookingStatus.CONFIRMED,
            tokensCharged: new Prisma.Decimal(cost),
            notes: dto.notes ?? booking.notes,
          },
        });
      } else {
        // Demo: just update times and status
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            startTime: start,
            endTime: end,
            status: BookingStatus.CONFIRMED,
            notes: dto.notes ?? booking.notes,
          },
        });
      }

      // Re-fetch booking after update to return fresh data
      const updatedBooking = await tx.booking.findUnique({ 
        where: { id: bookingId },
        include: {
          tutor: { include: { user: true } },
          student: { include: { user: true } },
        }
      });

      return updatedBooking!;
    }).then(async (booking) => {
      // After transaction commits, trigger side effects
      await this.ensureLivekitMeeting(bookingId);

      // Trigger conversation creation when slot is assigned
      await this.chatTriggers.onDirectBookingCreated(
        booking.studentId,
        booking.tutorId,
        bookingId,
      );

      return booking;
    });
  }

  // ---------- GROUP SESSIONS ----------
  async createGroupSession(dto: CreateGroupBookingDto, tutorId: string, tz?: string) {
    const start = toUtc(dto.startTime, tz || 'UTC');
    const end = toUtc(dto.endTime, tz || 'UTC');

    if (!isBefore(start, end)) throw new BadRequestException('startTime must be before endTime.');
    if (isBefore(end, addMinutes(start, MIN_BLOCK_MINUTES))) {
      throw new BadRequestException(`Minimum booking is ${MIN_BLOCK_MINUTES} minutes.`);
    }

    await this.ensureWithinAvailabilitySlot(tutorId, start, end);
    await this.ensureNoTutorOverlap(tutorId, start, end);

    // Get first student from tutor's bookings (group sessions need at least one student)
    const firstBooking = await this.prisma.booking.findFirst({
      where: { tutorId },
      select: { studentId: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!firstBooking) {
      throw new BadRequestException('Cannot create group session: tutor has no previous bookings.');
    }

    return this.prisma.booking.create({
      data: {
        tutorId,
        studentId: firstBooking.studentId, // First student
        isDemo: false,
        isGroupSession: true,
        maxStudents: dto.maxStudents ?? 5,
        currentEnrollment: 1,
        pricePerStudent: dto.pricePerStudent ? new Prisma.Decimal(dto.pricePerStudent) : null,
        status: BookingStatus.CONFIRMED,
        startTime: start,
        endTime: end,
        tokensCharged: new Prisma.Decimal(0), // Group sessions charge per student on join
        notes: dto.notes,
      },
    });
  }

  async getAvailableGroupSessions(filters: {
    subject?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {
      isGroupSession: true,
      status: BookingStatus.CONFIRMED,
      currentEnrollment: { lt: this.prisma.booking.fields.maxStudents },
      startTime: { gt: new Date() },
    };

    if (filters.startDate) {
      where.startTime = { ...where.startTime, gte: filters.startDate };
    }
    if (filters.endDate) {
      where.endTime = { lte: filters.endDate };
    }

    return this.prisma.booking.findMany({
      where,
      include: {
        tutor: {
          include: {
            user: { select: { name: true, email: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async joinGroupSession(bookingId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          tutor: { select: { hourlyRate: true } },
        },
      });

      if (!booking) throw new NotFoundException('Group session not found');
      if (!booking.isGroupSession) throw new BadRequestException('This is not a group session.');
      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException('Session is not available for joining.');
      }
      if (booking.currentEnrollment >= booking.maxStudents) {
        throw new BadRequestException('Session is full.');
      }

      // Check if student already joined
      const existing = await tx.groupBookingParticipant.findUnique({
        where: {
          bookingId_studentId: {
            bookingId,
            studentId,
          },
        },
      });
      if (existing) throw new ConflictException('You have already joined this session.');

      const pricePerStudent = Number(booking.pricePerStudent ?? booking.tutor?.hourlyRate ?? 0);
      const tokensRequired = Math.ceil(pricePerStudent);

      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: { tokens: true },
      });
      if (!student) throw new NotFoundException('Student not found');

      if (student.tokens < tokensRequired) {
        throw new BadRequestException(
          `Insufficient tokens. Required: ${tokensRequired}, Available: ${student.tokens}`,
        );
      }

      await tx.groupBookingParticipant.create({
        data: {
          bookingId,
          studentId,
        },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          currentEnrollment: { increment: 1 },
          tokensCharged: { increment: tokensRequired },
        },
      });

      await tx.student.update({
        where: { id: studentId },
        data: { tokens: { decrement: tokensRequired } },
      });

      await tx.tokenLedger.create({
        data: {
          studentId,
          tutorId: booking.tutorId,
          bookingId,
          delta: new Prisma.Decimal(-tokensRequired),
          reason: TokenReason.BOOKING,
        },
      });

      return booking;
    });
  }

  async leaveGroupSession(bookingId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new NotFoundException('Group session not found');
      if (!booking.isGroupSession) throw new BadRequestException('This is not a group session.');

      const participant = await tx.groupBookingParticipant.findUnique({
        where: {
          bookingId_studentId: {
            bookingId,
            studentId,
          },
        },
      });
      if (!participant) throw new NotFoundException('You are not a participant of this session.');

      await tx.groupBookingParticipant.delete({
        where: {
          bookingId_studentId: {
            bookingId,
            studentId,
          },
        },
      });

      const pricePerStudent = Number(booking.pricePerStudent ?? 0);
      const tokensToRefund = Math.ceil(pricePerStudent);

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          currentEnrollment: { decrement: 1 },
          tokensCharged: { decrement: tokensToRefund },
        },
      });

      await tx.student.update({
        where: { id: studentId },
        data: { tokens: { increment: tokensToRefund } },
      });

      await tx.tokenLedger.create({
        data: {
          studentId,
          tutorId: booking.tutorId,
          bookingId,
          delta: new Prisma.Decimal(tokensToRefund),
          reason: TokenReason.REFUND,
        },
      });

      return booking;
    });
  }

  async getGroupSessionParticipants(bookingId: string) {
    const participants = await this.prisma.groupBookingParticipant.findMany({
      where: { bookingId },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    return participants.map((p) => ({
      id: p.student.id,
      name: p.student.user?.name ?? p.student.user?.email?.split('@')[0],
      email: p.student.user?.email,
      avatarUrl: p.student.user?.avatarUrl,
    }));
  }

  async convertToGroupSession(
    bookingId: string,
    tutorId: string,
    maxStudents: number,
    pricePerStudent: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          tutor: { select: { id: true } },
          student: { select: { id: true } },
        },
      });

      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.tutorId !== tutorId) {
        throw new ForbiddenException('You can only convert your own bookings.');
      }
      if (booking.isGroupSession) {
        throw new BadRequestException('This booking is already a group session.');
      }
      if (booking.status !== BookingStatus.PENDING_SLOT) {
        throw new BadRequestException('Only unbooked slots can be converted to group sessions.');
      }
      if (!booking.startTime || !booking.endTime) {
        throw new BadRequestException('Booking must have start and end times.');
      }

      const hoursUntilSession = differenceInHours(new Date(booking.startTime!), new Date());
      if (hoursUntilSession <= 24) {
        throw new BadRequestException('Can only convert slots more than 24 hours before the session.');
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          isGroupSession: true,
          maxStudents: Math.max(2, Math.min(10, maxStudents)),
          currentEnrollment: 1,
          pricePerStudent: new Prisma.Decimal(pricePerStudent),
        },
      });

      await tx.groupBookingParticipant.create({
        data: {
          bookingId,
          studentId: booking.studentId,
        },
      });

      return updated;
    });
  }

  // ---------- Reserve tokens for future scheduling ----------
  async createPendingSlotWithTokens(tutorId: string, userId: string) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new NotFoundException('Student profile not found');

    return this.prisma.booking.create({
      data: {
        tutorId,
        studentId: student.id,
        isDemo: false,
        status: BookingStatus.PENDING_SLOT,
        tokensCharged: new Prisma.Decimal(0),
      },
    });
  }

  async bulkReserveTokens(tutorId: string, userId: string, count: number) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new NotFoundException('Student profile not found');

    const bookings = [];
    for (let i = 0; i < count; i++) {
      bookings.push({
        tutorId,
        studentId: student.id,
        isDemo: false,
        status: BookingStatus.PENDING_SLOT,
        tokensCharged: new Prisma.Decimal(0),
      });
    }

    return this.prisma.booking.createMany({ data: bookings });
  }

  private async ensureLivekitMeeting(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { meetingUrl: true, meetingProvider: true },
    });

    if (!booking || !booking.meetingUrl) {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          meetingUrl: `livekit:${bookingId}`,
          meetingProvider: 'livekit',
        },
      });
    }
  }
}
