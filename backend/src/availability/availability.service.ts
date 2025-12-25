import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
  import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { BookingStatus, TutorStatus } from '@prisma/client';
import { addMinutes, isBefore } from 'date-fns';
import { BookableQueryDto } from './dto/bookable-query.dto';
import { WaitlistService } from '../waitlist/waitlist.service';

const MIN_BLOCK_MINUTES = 15;

@Injectable()
export class AvailabilityService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WaitlistService))
    private waitlistService: WaitlistService,
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
      const existingStart = overlap.startTime.toLocaleString();
      const existingEnd = overlap.endTime.toLocaleString();
      throw new BadRequestException(
        `Slot conflicts with existing slot (${existingStart} - ${existingEnd})`
      );
    }
  }

  private async ensureNoBookingOverlap(tutorId: string, start: Date, end: Date) {
    const booked = await this.prisma.booking.findFirst({
      where: {
        tutorId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
      },
      select: { id: true },
    });
    if (booked) throw new BadRequestException('Time conflicts with an existing booking');
  }

  private validateWindow(start: Date, end: Date) {
    if (!isBefore(start, end)) throw new BadRequestException('Invalid time range');
    if (!isBefore(addMinutes(start, MIN_BLOCK_MINUTES), end)) {
      throw new BadRequestException(`Minimum slot is ${MIN_BLOCK_MINUTES} minutes`);
    }
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
    let t = new Date(Math.ceil(start.getTime() / stepMs) * stepMs);

    while (t.getTime() + durMs <= end.getTime()) {
      const sliceEnd = new Date(t.getTime() + durMs);
      yield [new Date(t), sliceEnd];
      t = new Date(t.getTime() + stepMs);
    }
  }

  // ---------------- tutor (me) ----------------

  async createMine(userId: string, dto: CreateSlotDto) {
    const tutor = await this.getTutorByUser(userId);

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    this.validateWindow(start, end);

    await this.ensureNoSlotOverlap(tutor.id, start, end);
    await this.ensureNoBookingOverlap(tutor.id, start, end);

    const slot = await this.prisma.availabilitySlot.create({
      data: { tutorId: tutor.id, startTime: start, endTime: end },
      select: { id: true, tutorId: true, startTime: true, endTime: true, createdAt: true },
    });

    // Notify waiting students about new availability
    await this.waitlistService.notifyWaitingStudentsForTutor(tutor.id);

    return slot;
  }

  async listMine(userId: string) {
    const tutor = await this.getTutorByUser(userId);
    return this.prisma.availabilitySlot.findMany({
      where: { tutorId: tutor.id },
      orderBy: { startTime: 'asc' },
      select: { id: true, tutorId: true, startTime: true, endTime: true, createdAt: true },
    });
  }

  async listMineWindow(userId: string, from?: string, to?: string) {
    const tutor = await this.getTutorByUser(userId);
    const where: any = { tutorId: tutor.id };
    if (from || to) {
      const start = from ? new Date(from) : new Date(0);
      const end = to ? new Date(to) : new Date(8640000000000000); // far future
      where.AND = [{ startTime: { lt: end } }, { endTime: { gt: start } }];
    }
    return this.prisma.availabilitySlot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      select: { id: true, tutorId: true, startTime: true, endTime: true, createdAt: true },
    });
  }

  async updateMine(userId: string, slotId: string, dto: UpdateSlotDto) {
    const tutor = await this.getTutorByUser(userId);

    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      select: { id: true, tutorId: true, startTime: true, endTime: true },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.tutorId !== tutor.id) throw new ForbiddenException('Not your slot');

    const start = dto.startTime ? new Date(dto.startTime) : slot.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : slot.endTime;
    this.validateWindow(start, end);

    await this.ensureNoSlotOverlap(tutor.id, start, end, slotId);
    await this.ensureNoBookingOverlap(tutor.id, start, end);

    return this.prisma.availabilitySlot.update({
      where: { id: slotId },
      data: { startTime: start, endTime: end },
      select: { id: true, tutorId: true, startTime: true, endTime: true, createdAt: true },
    });
  }

  async deleteMine(userId: string, slotId: string) {
    const tutor = await this.getTutorByUser(userId);

    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      select: { id: true, tutorId: true },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.tutorId !== tutor.id) throw new ForbiddenException('Not your slot');

    await this.prisma.availabilitySlot.delete({ where: { id: slotId } });
    return { deleted: true };
  }

  // Bulk update/replace helper used by UI "Save Availability" flows.
  // Accepts either:
  // - { slots: [{ id?, date: 'YYYY-MM-DD', startTime: 'HH:mm', endTime: 'HH:mm', title? }] }
  // - { from, to, slots: [...] } -> replace all slots within [from,to] with provided ones
  async updateMineBulk(userId: string, body: any) {
    const tutor = await this.getTutorByUser(userId);

    const parseIso = (dateStr: string, hhmm: string) => {
      const [h, m] = String(hhmm || '').split(':').map((x) => Number(x) || 0);
      const d = new Date(`${dateStr}T00:00:00`);
      d.setHours(h, m, 0, 0); // local time to ISO
      return d.toISOString();
    };

    const slotsInput: any[] = Array.isArray(body?.slots) ? body.slots : [];
    if (slotsInput.length === 0) return { updated: 0 };

    // If from/to provided: clear window first
    if (body?.from || body?.to) {
      const from = body.from ? new Date(body.from) : new Date(0);
      const to = body.to ? new Date(body.to) : new Date(8640000000000000);
      await this.prisma.availabilitySlot.deleteMany({
        where: { tutorId: tutor.id, AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }] },
      });
    }

    // Upsert each slot: if id points to own slot, update; else create
    let updated = 0;
    for (const s of slotsInput) {
      const date = s.date || s.day;
      if (!date || !s.startTime || !s.endTime) continue;
      const startIso = parseIso(date, s.startTime);
      const endIso = parseIso(date, s.endTime);

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

    return { updated };
  }

  // ---------------- public ----------------

  // list slots by tutor (only if tutor is APPROVED)
  async listByTutor(tutorId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, status: true },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');
    if (tutor.status !== TutorStatus.APPROVED) {
      throw new ForbiddenException('Tutor not approved');
    }

    return this.prisma.availabilitySlot.findMany({
      where: { tutorId },
      orderBy: { startTime: 'asc' },
      select: { id: true, tutorId: true, startTime: true, endTime: true, createdAt: true },
    });
  }

  // ready-to-book time slices for a tutor within an optional window
  async listBookable(tutorId: string, q: BookableQueryDto) {
    // validate tutor
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, status: true },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');
    if (tutor.status !== TutorStatus.APPROVED) {
      throw new ForbiddenException('Tutor not approved');
    }

    const windowStart = q.from ? new Date(q.from) : new Date(Date.now());
    const windowEnd = q.to ? new Date(q.to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7 days
    if (!(windowStart < windowEnd)) throw new BadRequestException('Invalid window');

    const durationMin = Math.max(15, q.durationMin ?? 60);
    const stepMin = Math.max(5, q.stepMin ?? 15);

    // fetch overlapping availability & bookings
    const [slots, bookings] = await this.prisma.$transaction([
      this.prisma.availabilitySlot.findMany({
        where: {
          tutorId,
          AND: [{ startTime: { lt: windowEnd } }, { endTime: { gt: windowStart } }],
        },
        orderBy: { startTime: 'asc' },
        select: { startTime: true, endTime: true },
      }),
      this.prisma.booking.findMany({
        where: {
          tutorId,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          AND: [{ startTime: { lt: windowEnd } }, { endTime: { gt: windowStart } }],
        },
        orderBy: { startTime: 'asc' },
        select: { startTime: true, endTime: true },
      }),
    ]);

    // build blocked list (clamped to window)
    const blocked: Array<[Date, Date]> = [];
    for (const b of bookings) {
      if (!b.startTime || !b.endTime) continue; // skip unscheduled demos
      const clamped = this.clampInterval(b.startTime, b.endTime, windowStart, windowEnd);
      if (clamped) blocked.push(clamped);
    }

    const freeWindows: Array<{ startTime: string; endTime: string }> = [];
    const slices: Array<{ startTime: string; endTime: string }> = [];

    for (const s of slots) {
      const clamped = this.clampInterval(s.startTime, s.endTime, windowStart, windowEnd);
      if (!clamped) continue;

      const freeParts = this.subtractIntervals(clamped, blocked);
      for (const fp of freeParts) {
        freeWindows.push({ startTime: fp[0].toISOString(), endTime: fp[1].toISOString() });

        for (const [ss, ee] of this.generateSlices(fp, durationMin, stepMin)) {
          slices.push({ startTime: ss.toISOString(), endTime: ee.toISOString() });
        }
      }
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
        sliceCount: slices.length,
      },
      freeWindows,
      slices,
    };
  }
}
