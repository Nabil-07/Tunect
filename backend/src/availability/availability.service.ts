import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
  import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { BookingStatus, TutorStatus } from '@prisma/client';
import { addDays, addMinutes, isBefore, startOfDay } from 'date-fns';
import { BookableQueryDto } from './dto/bookable-query.dto';
import { WaitlistService } from '../waitlist/waitlist.service';
import { AvailabilityTrackingService } from './availability-tracking.service';

const MIN_BLOCK_MINUTES = 15;

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WaitlistService))
    private readonly waitlistService: WaitlistService,
    private readonly trackingService: AvailabilityTrackingService,
  ) {}

  // ---------------- helpers ----------------

  private async getTutorByUser(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true, userId: true, status: true },
    });
    if (!tutor) throw new ForbiddenException('Only tutors can manage availability');
    if (tutor.status !== TutorStatus.APPROVED) {
      throw new ForbiddenException('Tutor not approved');
    }
    return tutor;
  }

  private async ensureNoSlotOverlap(
    tutorId: string,
    start: Date,
    end: Date,
    excludeId?: string,
    tzOffsetMinutes?: number,
  ) {
    // Check for any overlap or exact duplicate
    const overlap = await this.prisma.availabilitySlot.findFirst({
      where: {
        tutorId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        OR: [
          // Overlap: existing slot intersects with new slot
          {
            AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
          },
          // Exact duplicate
          {
            AND: [{ startTime: { equals: start } }, { endTime: { equals: end } }],
          },
        ],
      },
      select: { id: true, startTime: true, endTime: true },
    });
    if (overlap) {
      // Format dates in a user-friendly way (YYYY-MM-DD HH:MM format)
      const formatDateTime = (date: Date) => {
        if (typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)) {
          const adjusted = new Date(date.getTime() - tzOffsetMinutes * 60_000);
          const year = adjusted.getUTCFullYear();
          const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
          const day = String(adjusted.getUTCDate()).padStart(2, '0');
          const hours = String(adjusted.getUTCHours()).padStart(2, '0');
          const minutes = String(adjusted.getUTCMinutes()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}`;
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      };
      const existingStart = formatDateTime(overlap.startTime);
      const existingEnd = formatDateTime(overlap.endTime);
      throw new BadRequestException(
        `Slot conflicts with existing slot (${existingStart} - ${existingEnd})`
      );
    }
  }

  private async ensureNoBookingOverlap(tutorId: string, start: Date, end: Date) {
    const now = new Date();
    // Only check for active bookings (not completed, canceled, failed, or in the past)
    // A booking is considered active if:
    // 1. It's PENDING or CONFIRMED status
    // 2. It has both startTime and endTime set
    // 3. It hasn't ended yet (endTime is in the future)
    // 4. It overlaps with the requested time slot
    
    // First, get all potential conflicting bookings for debugging
    const allBookings = await this.prisma.booking.findMany({
      where: {
        tutorId,
        startTime: { not: null },
        endTime: { not: null },
      },
      select: { 
        id: true, 
        startTime: true, 
        endTime: true, 
        status: true,
        student: {
          select: {
            user: {
              select: { name: true, email: true }
            }
          }
        }
      },
      orderBy: { startTime: 'desc' },
      take: 20, // Get recent bookings for debugging
    });
    
    // Log all bookings for debugging
    this.logger.log(`[ensureNoBookingOverlap] Checking ${allBookings.length} bookings for tutor ${tutorId}`);
    this.logger.log(`[ensureNoBookingOverlap] Requested slot: ${start.toISOString()} to ${end.toISOString()}`);
    this.logger.log(`[ensureNoBookingOverlap] Current time: ${now.toISOString()}`);
    
    // Filter to only active future bookings that overlap
    const booked = allBookings.find((b) => {
      if (!b.startTime || !b.endTime) {
        this.logger.debug(`[ensureNoBookingOverlap] Skipping booking ${b.id}: missing times`);
        return false;
      }
      if (b.status !== BookingStatus.PENDING && b.status !== BookingStatus.CONFIRMED) {
        this.logger.debug(`[ensureNoBookingOverlap] Skipping booking ${b.id}: status=${b.status}`);
        return false;
      }
      if (b.endTime <= now) {
        this.logger.debug(`[ensureNoBookingOverlap] Skipping booking ${b.id}: past booking (ended ${b.endTime.toISOString()})`);
        return false;
      }
      // Check overlap
      const overlaps = b.startTime < end && b.endTime > start;
      if (overlaps) {
        this.logger.warn(`[ensureNoBookingOverlap] CONFLICT FOUND: Booking ${b.id} overlaps with requested slot`);
        this.logger.warn(`  Booking: ${b.startTime.toISOString()} to ${b.endTime.toISOString()}, status=${b.status}`);
        this.logger.warn(`  Requested: ${start.toISOString()} to ${end.toISOString()}`);
      }
      return overlaps;
    });
    
    if (booked) {
      const studentName = booked.student?.user?.name || booked.student?.user?.email || 'Unknown';
      const formatTime = (d: Date) => d.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const errorMsg = `Time conflicts with an existing ${booked.status.toLowerCase()} booking ` +
        `(${formatTime(booked.startTime!)} - ${formatTime(booked.endTime!)}) ` +
        `with student: ${studentName}. ` +
        `Please choose a different time slot.`;
      this.logger.error(`[ensureNoBookingOverlap] ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }
    
    this.logger.log(`[ensureNoBookingOverlap] No conflicts found - slot creation allowed`);
  }

  private validateWindow(start: Date, end: Date) {
    if (!isBefore(start, end)) throw new BadRequestException('Invalid time range');
    if (!isBefore(addMinutes(start, MIN_BLOCK_MINUTES), end)) {
      throw new BadRequestException(`Minimum slot is ${MIN_BLOCK_MINUTES} minutes`);
    }
  }

  private normalizeOvernightEnd(start: Date, end: Date) {
    // If end is earlier than start, treat it as crossing midnight (next day)
    if (!isBefore(start, end)) {
      return addDays(end, 1);
    }
    return end;
  }

  private clampInterval(aStart: Date, aEnd: Date, wStart: Date, wEnd: Date): [Date, Date] | null {
    const start = new Date(Math.max(aStart.getTime(), wStart.getTime()));
    const end = new Date(Math.min(aEnd.getTime(), wEnd.getTime()));
    if (start >= end) return null;
    return [start, end];
  }

  private subtractIntervals(
    base: [Date, Date],
    blocks: Array<[Date, Date]>,
  ): Array<[Date, Date]> {
    let result: Array<[Date, Date]> = [base];

    for (const [bStart, bEnd] of blocks) {
      const next: Array<[Date, Date]> = [];
      for (const [s, e] of result) {
        if (bEnd <= s || bStart >= e) {
          next.push([s, e]); // no overlap
          continue;
        }
        // left remainder
        if (bStart > s) next.push([s, new Date(bStart)]);
        // right remainder
        if (bEnd < e) next.push([new Date(bEnd), e]);
      }
      result = next;
      if (result.length === 0) break;
    }
    return result.sort((a, b) => a[0].getTime() - b[0].getTime());
  }

  private *generateSlices(free: [Date, Date], durationMin: number, stepMin: number): Generator<[Date, Date]> {
    const [start, end] = free;
    // align start to grid
    const stepMs = stepMin * 60_000;
    const durMs = durationMin * 60_000;
    const yielded = new Set<number>();

    // Always include exact window start when it can fit a full duration.
    // This prevents losing valid slots like 02:25-03:25 when step=15 and duration=60.
    if (start.getTime() + durMs <= end.getTime()) {
      const exactEnd = new Date(start.getTime() + durMs);
      yielded.add(start.getTime());
      yield [new Date(start), exactEnd];
    }

    let t = new Date(Math.ceil(start.getTime() / stepMs) * stepMs);

    while (t.getTime() + durMs <= end.getTime()) {
      const tMs = t.getTime();
      if (!yielded.has(tMs)) {
        const sliceEnd = new Date(tMs + durMs);
        yielded.add(tMs);
        yield [new Date(tMs), sliceEnd];
      }
      t = new Date(t.getTime() + stepMs);
    }
  }

  private async buildTemplateSlots(
    tutorId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<Array<{ startTime: Date; endTime: Date }>> {
    const templates = await this.prisma.recurringTemplate.findMany({
      where: { tutorId, isActive: true },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    });

    if (templates.length === 0) return [];

    const slots: Array<{ startTime: Date; endTime: Date }> = [];
    const cursor = startOfDay(windowStart);
    const endDay = startOfDay(windowEnd);

    for (let d = new Date(cursor); d <= endDay; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const dayTemplates = templates.filter((t) => t.dayOfWeek === dayOfWeek);
      if (dayTemplates.length === 0) continue;

      for (const t of dayTemplates) {
        const [sh, sm] = t.startTime.split(':').map(Number);
        const [eh, em] = t.endTime.split(':').map(Number);
        const start = new Date(d);
        start.setHours(sh || 0, sm || 0, 0, 0);
        const end = new Date(d);
        end.setHours(eh || 0, em || 0, 0, 0);
        if (end.getTime() <= start.getTime()) {
          end.setDate(end.getDate() + 1);
        }

        if (end <= windowStart || start >= windowEnd) continue;
        slots.push({ startTime: start, endTime: end });
      }
    }

    return slots;
  }

  // ---------------- tutor (me) ----------------

  async createMine(userId: string, dto: CreateSlotDto) {
    const tutor = await this.getTutorByUser(userId);

    const start = new Date(dto.startTime);
    const end = this.normalizeOvernightEnd(start, new Date(dto.endTime));
    this.validateWindow(start, end);

    await this.ensureNoSlotOverlap(tutor.id, start, end, undefined, dto.tzOffsetMinutes);
    await this.ensureNoBookingOverlap(tutor.id, start, end);

    const slot = await this.prisma.availabilitySlot.create({
      data: { tutorId: tutor.id, startTime: start, endTime: end, title: dto.title?.trim() || null },
      select: { id: true, tutorId: true, startTime: true, endTime: true, title: true, createdAt: true },
    });

    // Notify waiting students about new availability
    await this.waitlistService.notifyWaitingStudentsForTutor(tutor.id);

    // Update tutor availability metrics (fire-and-forget)
    this.trackingService.updateTutorAvailabilityMetrics(tutor.id).catch(err => {
      this.logger.warn(`Failed to update availability metrics for tutor ${tutor.id}:`, err);
    });

    return slot;
  }

  /**
   * Cross-reference slots with bookings to set a `booked` flag.
   * A slot is considered booked if any non-cancelled booking overlaps its time range.
   */
  private async enrichSlotsWithBookingStatus(
    tutorId: string,
    slots: { id: string; tutorId: string; startTime: Date; endTime: Date; title: string | null; createdAt: Date }[],
  ) {
    if (!slots.length) return [];

    const earliest = slots.reduce((min, s) => (s.startTime < min ? s.startTime : min), slots[0].startTime);
    const latest = slots.reduce((max, s) => (s.endTime > max ? s.endTime : max), slots[0].endTime);

    const bookings = await this.prisma.booking.findMany({
      where: {
        tutorId,
        startTime: { lt: latest },
        endTime: { gt: earliest },
        status: {
          notIn: [
            BookingStatus.CANCELED,
            BookingStatus.FAILED_TECHNICAL,
            BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
            BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
          ],
        },
      },
      select: { startTime: true, endTime: true, status: true },
    });

    return slots.map((slot) => {
      const overlapping = bookings.find(
        (b) => b.startTime && b.endTime && b.startTime < slot.endTime && b.endTime > slot.startTime,
      );
      return {
        ...slot,
        booked: !!overlapping,
        bookingStatus: overlapping?.status ?? null,
      };
    });
  }

  async listMine(userId: string) {
    const tutor = await this.getTutorByUser(userId);
    const slots = await this.prisma.availabilitySlot.findMany({
      where: { tutorId: tutor.id },
      orderBy: { startTime: 'asc' },
      select: { id: true, tutorId: true, startTime: true, endTime: true, title: true, createdAt: true },
    });
    return this.enrichSlotsWithBookingStatus(tutor.id, slots);
  }

  async listMineWindow(userId: string, from?: string, to?: string) {
    const tutor = await this.getTutorByUser(userId);
    const where: any = { tutorId: tutor.id };
    if (from || to) {
      const start = from ? new Date(from) : new Date(0);
      const end = to ? new Date(to) : new Date(8640000000000000); // far future
      where.AND = [{ startTime: { lt: end } }, { endTime: { gt: start } }];
    }
    const slots = await this.prisma.availabilitySlot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      select: { id: true, tutorId: true, startTime: true, endTime: true, title: true, createdAt: true },
    });
    return this.enrichSlotsWithBookingStatus(tutor.id, slots);
  }

  async updateMine(userId: string, slotId: string, dto: UpdateSlotDto) {
    const tutor = await this.getTutorByUser(userId);

    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      select: { id: true, tutorId: true, startTime: true, endTime: true },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.tutorId !== tutor.id) throw new ForbiddenException('Not your slot');

    // Prevent editing a slot that has an active or completed booking
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        tutorId: tutor.id,
        startTime: { lt: slot.endTime },
        endTime: { gt: slot.startTime },
        status: {
          notIn: [
            BookingStatus.CANCELED,
            BookingStatus.FAILED_TECHNICAL,
            BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
            BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
          ],
        },
      },
    });
    if (existingBooking) {
      throw new BadRequestException('Cannot edit a slot that has an active or completed booking.');
    }

    const start = dto.startTime ? new Date(dto.startTime) : slot.startTime;
    const end = this.normalizeOvernightEnd(start, dto.endTime ? new Date(dto.endTime) : slot.endTime);
    this.validateWindow(start, end);

    await this.ensureNoSlotOverlap(tutor.id, start, end, slotId, dto.tzOffsetMinutes);
    await this.ensureNoBookingOverlap(tutor.id, start, end);

    const updated = await this.prisma.availabilitySlot.update({
      where: { id: slotId },
      data: {
        startTime: start,
        endTime: end,
        ...(dto.title === undefined ? {} : { title: dto.title?.trim() || null }),
      },
      select: { id: true, tutorId: true, startTime: true, endTime: true, title: true, createdAt: true },
    });

    this.trackingService.updateTutorAvailabilityMetrics(tutor.id).catch(err => {
      this.logger.warn(`Failed to update availability metrics for tutor ${tutor.id}:`, err);
    });

    return updated;
  }

  async deleteMine(userId: string, slotId: string) {
    const tutor = await this.getTutorByUser(userId);

    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      select: { id: true, tutorId: true, startTime: true, endTime: true },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.tutorId !== tutor.id) throw new ForbiddenException('Not your slot');

    // Prevent deleting a slot that has an active or completed booking
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        tutorId: tutor.id,
        startTime: { lt: slot.endTime },
        endTime: { gt: slot.startTime },
        status: {
          notIn: [
            BookingStatus.CANCELED,
            BookingStatus.FAILED_TECHNICAL,
            BookingStatus.AUTO_CANCELLED_TUTOR_NO_SHOW,
            BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
          ],
        },
      },
    });
    if (existingBooking) {
      throw new BadRequestException('Cannot delete a slot that has an active or completed booking.');
    }

    await this.prisma.availabilitySlot.delete({ where: { id: slotId } });

    this.trackingService.updateTutorAvailabilityMetrics(tutor.id).catch(err => {
      this.logger.warn(`Failed to update availability metrics for tutor ${tutor.id}:`, err);
    });

    return { deleted: true };
  }

  // Bulk update/replace helper used by UI "Save Availability" flows.
  // Accepts either:
  // - { slots: [{ id?, date: 'YYYY-MM-DD', startTime: 'HH:mm', endTime: 'HH:mm', title? }] }
  // - { from, to, slots: [...] } -> replace all slots within [from,to] with provided ones
  async updateMineBulk(userId: string, body: any) { // NOSONAR
    const tutor = await this.getTutorByUser(userId);

    const parseIso = (dateStr: string, hhmm: string, tzOffsetMinutes?: number) => {
      const [h, m] = String(hhmm || '').split(':').map((x) => Number(x) || 0);
      if (typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)) {
        const [yy, mm, dd] = dateStr.split('-').map(Number);
        const utcMs = Date.UTC(yy || 0, (mm || 1) - 1, dd || 1, h, m, 0, 0);
        return new Date(utcMs + tzOffsetMinutes * 60_000).toISOString();
      }
      const d = new Date(`${dateStr}T00:00:00`);
      d.setHours(h, m, 0, 0); // server-local fallback
      return d.toISOString();
    };

    const slotsInput: any[] = Array.isArray(body?.slots) ? body.slots : [];

    // If from/to provided: clear window first (even if slots are empty)
    let cleared = 0;
    if (body?.from || body?.to) {
      const from = body.from ? new Date(body.from) : new Date(0);
      const to = body.to ? new Date(body.to) : new Date(8640000000000000);
      const res = await this.prisma.availabilitySlot.deleteMany({
        where: { tutorId: tutor.id, AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }] },
      });
      cleared = res?.count ?? 0;
    }

    if (slotsInput.length === 0) {
      // Update metrics even if clearing slots
      this.trackingService.updateTutorAvailabilityMetrics(tutor.id).catch(err => {
        this.logger.warn(`Failed to update availability metrics for tutor ${tutor.id}:`, err);
      });
      return { updated: 0, cleared };
    }

    // Upsert each slot: if id points to own slot, update; else create
    let updated = 0;
    const defaultTzOffset = typeof body?.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : undefined;

    for (const s of slotsInput) {
      const tzOffset = typeof s?.tzOffsetMinutes === 'number' ? s.tzOffsetMinutes : defaultTzOffset;
      const hasIso = typeof s?.startTime === 'string' && s.startTime.includes('T') && typeof s?.endTime === 'string' && s.endTime.includes('T');
      const date = s.date || s.day;
      if (!s.startTime || !s.endTime) continue;

      let startIso: string | undefined;
      let endIso: string | undefined;

      if (hasIso) {
        const startDate = new Date(s.startTime);
        const endDate = new Date(s.endTime);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;
        startIso = startDate.toISOString();
        endIso = endDate.toISOString();
      } else {
        startIso = date ? parseIso(date, s.startTime, tzOffset) : undefined;
        endIso = date ? parseIso(date, s.endTime, tzOffset) : undefined;
      }

      if (!startIso || !endIso) continue;

      // If end is earlier than start, treat it as crossing midnight (next day)
      const startDate = new Date(startIso);
      let endDate = new Date(endIso);
      if (endDate.getTime() <= startDate.getTime()) {
        endDate = addDays(endDate, 1);
      }
      startIso = startDate.toISOString();
      endIso = endDate.toISOString();
      if (endDate.getTime() <= startDate.getTime()) continue;

      if (s.id) {
        const existing = await this.prisma.availabilitySlot.findUnique({
          where: { id: s.id },
          select: { id: true, tutorId: true },
        });
        if (existing && existing.tutorId === tutor.id) {
          await (this.prisma.availabilitySlot as any).update({
            where: { id: s.id },
            data: { startTime: startIso as any, endTime: endIso as any, title: s.title },
          });
          updated++;
          continue;
        }
      }

      // Check for duplicates before creating
      const duplicate = await this.prisma.availabilitySlot.findFirst({
        where: {
          tutorId: tutor.id,
          startTime: startIso as any,
          endTime: endIso as any,
        },
      });
      
      if (duplicate) {
        // Skip duplicate - already exists
        continue;
      }

      await (this.prisma.availabilitySlot as any).create({
        data: { tutorId: tutor.id, startTime: startIso as any, endTime: endIso as any, title: s.title },
      });
      updated++;
    }

    // Update tutor availability metrics after bulk update (fire-and-forget)
    this.trackingService.updateTutorAvailabilityMetrics(tutor.id).catch(err => {
      this.logger.warn(`Failed to update availability metrics for tutor ${tutor.id}:`, err);
    });

    return { updated };
  }

  // ---------------- public ----------------

  // list slots by tutor (only if tutor is APPROVED)
  async listByTutor(tutorId: string) {
    // Use same lookup logic as TutorsService.getByIdOrTid
    // First try exact match by full ID
    let tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, status: true },
    });
    
    // Then try by tutorTid
    tutor ??= await this.prisma.tutor.findUnique({
      where: { tutorTid: tutorId },
      select: { id: true, status: true },
    });
    
    // Finally try finding by ID ending with the provided string (for slug-based lookups)
    tutor ??= await this.prisma.tutor.findFirst({
      where: { id: { endsWith: tutorId } },
      select: { id: true, status: true },
    });

    // Fallback: allow passing tutor userId
    tutor ??= await this.prisma.tutor.findUnique({
      where: { userId: tutorId },
      select: { id: true, status: true },
    });
    
    if (!tutor) throw new NotFoundException('Tutor not found');
    if (tutor.status !== TutorStatus.APPROVED) {
      throw new ForbiddenException('Tutor not approved');
    }
    
    // Use the resolved tutor ID for subsequent queries
    const resolvedTutorId = tutor.id;

    // Get all slots
    const slots = await this.prisma.availabilitySlot.findMany({
      where: { tutorId: resolvedTutorId },
      orderBy: { startTime: 'asc' },
      select: { id: true, tutorId: true, startTime: true, endTime: true, title: true, createdAt: true },
    });

    // Get all confirmed/pending bookings for this tutor
    const bookings = await this.prisma.booking.findMany({
      where: {
        tutorId: resolvedTutorId,
        status: { in: ['CONFIRMED', 'PENDING', 'PENDING_SLOT'] },
      },
      select: { startTime: true, endTime: true },
    });

    const blocked = bookings
      .filter((b) => b.startTime && b.endTime)
      .map((b) => [b.startTime as Date, b.endTime as Date] as [Date, Date]);

    const availableSlots = slots.flatMap((slot) => {
      const base: [Date, Date] = [slot.startTime, slot.endTime];
      const overlaps = blocked.filter(([bStart, bEnd]) => bEnd > base[0] && bStart < base[1]);
      if (!overlaps.length) {
        return [{ 
          id: slot.id as string | undefined, 
          tutorId: slot.tutorId, 
          startTime: slot.startTime, 
          endTime: slot.endTime, 
          createdAt: slot.createdAt 
        }];
      }
      const freeParts = this.subtractIntervals(base, overlaps);
      return freeParts.map(([s, e]) => ({
        id: undefined as string | undefined,
        tutorId: slot.tutorId,
        startTime: s,
        endTime: e,
        createdAt: slot.createdAt,
      }));
    });

    return availableSlots;
  }

  // ready-to-book time slices for a tutor within an optional window
  async listBookable(tutorId: string, q: BookableQueryDto) { // NOSONAR
    // validate tutor - use same lookup logic as TutorsService.getByIdOrTid
    // First try exact match by full ID
    let tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, status: true },
    });
    
    // Then try by tutorTid
    tutor ??= await this.prisma.tutor.findUnique({
      where: { tutorTid: tutorId },
      select: { id: true, status: true },
    });
    
    // Finally try finding by ID ending with the provided string (for slug-based lookups)
    tutor ??= await this.prisma.tutor.findFirst({
      where: { id: { endsWith: tutorId } },
      select: { id: true, status: true },
    });

    // Fallback: allow passing tutor userId
    tutor ??= await this.prisma.tutor.findUnique({
      where: { userId: tutorId },
      select: { id: true, status: true },
    });
    
    if (!tutor) throw new NotFoundException('Tutor not found');
    if (tutor.status !== TutorStatus.APPROVED) {
      throw new ForbiddenException('Tutor not approved');
    }
    
    // Use the resolved tutor ID for subsequent queries
    const resolvedTutorId = tutor.id;

    const windowStart = q.from ? new Date(q.from) : new Date(Date.now());
    const windowEnd = q.to ? new Date(q.to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7 days
    if (windowStart >= windowEnd) throw new BadRequestException('Invalid window');

    const durationMin = Math.max(15, q.durationMin ?? 60);
    const stepMin = Math.max(5, q.stepMin ?? 15);

    // fetch overlapping availability & bookings
    const [slots, bookings] = await this.prisma.$transaction([
      this.prisma.availabilitySlot.findMany({
        where: {
          tutorId: resolvedTutorId,
          AND: [{ startTime: { lt: windowEnd } }, { endTime: { gt: windowStart } }],
        },
        orderBy: { startTime: 'asc' },
        select: { id: true, startTime: true, endTime: true, title: true, createdAt: true },
      }),
      this.prisma.booking.findMany({
        where: {
          tutorId: resolvedTutorId,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          AND: [{ startTime: { lt: windowEnd } }, { endTime: { gt: windowStart } }],
        },
        orderBy: { startTime: 'asc' },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const overlapsAny = (
      start: Date,
      end: Date,
      intervals: Array<{ startTime: Date; endTime: Date }>,
    ) => intervals.some((existing) => existing.endTime > start && existing.startTime < end);

    // Keep latest explicit slot when overlapping historical/stale records exist.
    const explicitKept: Array<{ startTime: Date; endTime: Date; subject?: string }> = [];
    const slotsByRecency = [...slots].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const slot of slotsByRecency) {
      if (overlapsAny(slot.startTime, slot.endTime, explicitKept)) continue;
      explicitKept.push({
        startTime: slot.startTime,
        endTime: slot.endTime,
        subject: slot.title || undefined,
      });
    }

    // Add template slots only when they don't overlap explicit slots.
    const templateSlots = await this.buildTemplateSlots(resolvedTutorId, windowStart, windowEnd);
    const templateKept = templateSlots
      .filter((slot) => !overlapsAny(slot.startTime, slot.endTime, explicitKept))
      .map((slot) => ({ ...slot, subject: undefined as string | undefined }));

    const dedupe = new Set<string>();
    const mergedSlots = [...explicitKept, ...templateKept]
      .filter((s) => {
        const key = `${s.startTime.toISOString()}::${s.endTime.toISOString()}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // build blocked list (clamped to window)
    const blocked: Array<[Date, Date]> = [];
    for (const b of bookings) {
      if (!b.startTime || !b.endTime) continue; // skip unscheduled demos
      const clamped = this.clampInterval(b.startTime, b.endTime, windowStart, windowEnd);
      if (clamped) blocked.push(clamped);
    }

    const freeWindows: Array<{ startTime: string; endTime: string }> = [];
    const slices: Array<{ startTime: string; endTime: string; subject?: string }> = [];

    for (const s of mergedSlots) {
      const clamped = this.clampInterval(s.startTime, s.endTime, windowStart, windowEnd);
      if (!clamped) continue;

      const freeParts = this.subtractIntervals(clamped, blocked);
      for (const fp of freeParts) {
        freeWindows.push({ startTime: fp[0].toISOString(), endTime: fp[1].toISOString() });

        for (const [ss, ee] of this.generateSlices(fp, durationMin, stepMin)) {
          slices.push({ startTime: ss.toISOString(), endTime: ee.toISOString(), subject: s.subject });
        }
      }
    }

    const uniqueSlices = new Map<string, { startTime: string; endTime: string; subject?: string }>();
    for (const slice of slices) {
      const key = `${slice.startTime}::${slice.endTime}`;
      if (!uniqueSlices.has(key)) uniqueSlices.set(key, slice);
    }

    return {
      meta: {
        tutorId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        durationMin,
        stepMin,
        slots: slots.length,
        bookings: bookings.length,
        freeWindowCount: freeWindows.length,
        sliceCount: uniqueSlices.size,
      },
      freeWindows,
      slices: Array.from(uniqueSlices.values()),
    };
  }
}
