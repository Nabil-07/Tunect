// src/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchTutorsDto } from './dto/search-tutors.dto';
import { TutorStatus } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Robust tutor search that:
   * - Applies only valid filters (never passes bad shapes to Prisma)
   * - Uses an availability pre-query to avoid guessing the relation name in Tutor.where
   * - Orders by `id desc` (always present) to avoid schema mismatch crashes
   */
  async searchTutors(q: SearchTutorsDto) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.min(100, Math.max(q.pageSize ?? 20, 1));
    const skip = (page - 1) * pageSize;

    // Base filter: only approved tutors
    const whereTutor: any = { status: TutorStatus.APPROVED };

    // Subject filter (assuming Tutor.subjects: string[])
    if (q.subject && q.subject.trim()) {
      whereTutor.subjects = { has: q.subject.trim() };
    }

    // Rate filter
    if (q.minRate != null || q.maxRate != null) {
      const rate: any = {};
      if (q.minRate != null) rate.gte = q.minRate;
      if (q.maxRate != null) rate.lte = q.maxRate;
      whereTutor.hourlyRate = rate;
    }

    // Simple text search against bio
    if (q.q && q.q.trim()) {
      whereTutor.bio = { contains: q.q.trim(), mode: 'insensitive' };
    }

    // Availability window → precompute matching tutor IDs via the AvailabilitySlot table
    let tutorIdsByWindow: string[] | undefined;
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;

    if (from && to && from < to) {
      const windowHits = await this.prisma.availabilitySlot.findMany({
        where: {
          AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }],
        },
        select: { tutorId: true },
        distinct: ['tutorId'],
      });
      tutorIdsByWindow = windowHits.map((w) => w.tutorId);

      // No tutors available in that window → early return
      if (tutorIdsByWindow.length === 0) {
        return { items: [], meta: { page, pageSize, total: 0, totalPages: 0 } };
      }

      // add to base filter
      whereTutor.id = { in: tutorIdsByWindow };
    }

    // Fetch tutors page (safe orderBy)
    const [tutors, total] = await this.prisma.$transaction([
      this.prisma.tutor.findMany({
        where: whereTutor,
        skip,
        take: pageSize,
        orderBy: { id: 'desc' }, // safe fallback for all schemas
        select: {
          id: true,
          bio: true,
          hourlyRate: true,
          subjects: true,
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          // If you do have updatedAt/createdAt and want it in UI, add them here
        },
      }),
      this.prisma.tutor.count({ where: whereTutor }),
    ]);

    const tutorIds = tutors.map((t) => t.id);
    if (tutorIds.length === 0) {
      return { items: [], meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    }

    // Ratings (avg + count) — if you have Review model
    let ratingMap = new Map<string, { avg: number | null; count: number }>();
    try {
      const ratings = await this.prisma.review.groupBy({
        by: ['tutorId'],
        _avg: { rating: true },
        _count: { _all: true },
        where: { tutorId: { in: tutorIds } },
      });
      ratingMap = new Map(
        ratings.map((r) => [r.tutorId, { avg: r._avg.rating ?? null, count: r._count._all }]),
      );
    } catch {
      // If Review model/field differs, silently degrade (no ratings rather than 500)
    }

    // Availability snippet:
    // - If window is given → up to 5 matches inside window
    // - Else → next 3 future slots
    const now = new Date();
    const maxSlotsPerTutor = from && to ? 5 : 3;
    const slotWhere =
      from && to && from < to
        ? { AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }] }
        : { startTime: { gt: now } };

    const rawSlots = await this.prisma.availabilitySlot.findMany({
      where: { tutorId: { in: tutorIds }, ...slotWhere },
      orderBy: { startTime: 'asc' },
      take: tutorIds.length * maxSlotsPerTutor, // enough to trim per tutor
      select: { id: true, tutorId: true, startTime: true, endTime: true },
    });

    const slotMap = new Map<string, Array<{ id: string; startTime: string; endTime: string }>>();
    for (const s of rawSlots) {
      const arr = slotMap.get(s.tutorId) ?? [];
      if (arr.length < maxSlotsPerTutor) {
        arr.push({
          id: s.id,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
        });
        slotMap.set(s.tutorId, arr);
      }
    }

    const items = tutors.map((t) => {
      const r = ratingMap.get(t.id);
      return {
        id: t.id,
        bio: t.bio,
        hourlyRate: t.hourlyRate,
        subjects: t.subjects,
        user: t.user,
        rating: r?.avg ?? null,
        reviewsCount: r?.count ?? 0,
        nextSlots: slotMap.get(t.id) ?? [],
      };
    });

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Popular subjects for filter chips (optimized with raw SQL) */
  async listSubjects(limit = 50) {
    // Use raw query for better performance on large datasets
    const result = await this.prisma.$queryRaw<Array<{ subject: string; count: bigint }>>`
      SELECT unnest(subjects) as subject, COUNT(*) as count
      FROM "Tutor"
      WHERE status = 'APPROVED'
      GROUP BY subject
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    
    const items = result.map(r => ({
      subject: r.subject,
      count: Number(r.count)
    }));
    
    return { items };
  }
}
