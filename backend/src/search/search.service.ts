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
   * - Text search (q) uses post-query partial matching for reliable results
   */
  async searchTutors(q: SearchTutorsDto) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.min(100, Math.max(q.pageSize ?? 20, 1));

    // Base filter: only approved tutors with at least 1 subject and price > 0
    const whereTutor: any = {
      status: TutorStatus.APPROVED,
      subjects: { isEmpty: false },
      hourlyRate: { gt: 0 },
    };
    const AND: any[] = [];

    // Text search (q) - handled in post-query filter for reliable partial matching
    // Prisma's 'has' only does exact array matches; it cannot do partial matching
    // e.g., "Math" will NOT match "Mathematics" with 'has'
    const qSearchTerm = q.q?.trim() || null;

    // Subject filter (assuming Tutor.subjects: string[]) - MUST match exactly
    if (q.subject && q.subject.trim()) {
      const subject = q.subject.trim();
      // Case-insensitive matching for subject - use OR within AND for case variants
      AND.push({
        OR: [
          { subjects: { has: subject } },
          { subjects: { has: subject.toUpperCase() } },
          { subjects: { has: subject.toLowerCase() } },
          { subjects: { has: subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase() } }, // Capitalized
        ],
      });
    }

    // Rate filter
    if (q.minRate != null || q.maxRate != null) {
      const rate: any = {};
      if (q.minRate != null) rate.gte = q.minRate;
      if (q.maxRate != null) rate.lte = q.maxRate;
      whereTutor.hourlyRate = rate;
    }

    // NOTE: Text search (q) is NOT added to Prisma query here
    // It's handled in post-query filter below for partial matching support

    // Apply AND conditions if any
    if (AND.length > 0) {
      whereTutor.AND = AND;
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
      if (whereTutor.AND) {
        whereTutor.AND.push({ id: { in: tutorIdsByWindow } });
      } else {
        whereTutor.id = { in: tutorIdsByWindow };
      }
    }

    // When text search (q) is used, fetch more records to filter in application code
    // because Prisma's 'has' operator only supports exact matches, not partial matching
    const needsTextSearchFilter = !!qSearchTerm;

    // Fetch tutors (safe orderBy)
    const [tutors, dbTotal] = await this.prisma.$transaction([
      this.prisma.tutor.findMany({
        where: whereTutor,
        // When doing text search, skip pagination at DB level - apply it after filtering
        skip: needsTextSearchFilter ? 0 : (page - 1) * pageSize,
        take: needsTextSearchFilter ? 1000 : pageSize, // Fetch up to 1000 for text search filtering
        orderBy: { id: 'desc' }, // safe fallback for all schemas
        select: {
          id: true,
          bio: true,
          hourlyRate: true,
          subjects: true,
          classesTeach: true,
          languages: true,
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          // If you do have updatedAt/createdAt and want it in UI, add them here
        },
      }),
      this.prisma.tutor.count({ where: whereTutor }),
    ]);

    const tutorIds = tutors.map((t) => t.id);
    if (tutorIds.length === 0) {
      return { items: [], meta: { page, pageSize, total: dbTotal, totalPages: Math.ceil(dbTotal / pageSize) } };
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

    // Apply partial matching for text search (q parameter) on subjects/classes/languages
    // This handles cases where user searches "Math" and tutor has "Mathematics" or "Applied Mathematics"
    let filteredTutors = tutors;
    let finalTotal = dbTotal;

    if (needsTextSearchFilter && qSearchTerm) {
      const qLower = qSearchTerm.toLowerCase();
      filteredTutors = tutors.filter((tutor) => {
        // Check bio and name for partial matches
        const bioMatch = tutor.bio?.toLowerCase().includes(qLower);
        const nameMatch = tutor.user?.name?.toLowerCase().includes(qLower);
        
        if (bioMatch || nameMatch) {
          return true;
        }
        
        // Check for partial matches in subjects, classes, or languages
        const subjects = (tutor.subjects || []).map((s: string) => s.toLowerCase());
        const classes = (tutor.classesTeach || []).map((c: string) => c.toLowerCase());
        const languages = (tutor.languages || []).map((l: string) => l.toLowerCase());
        
        const subjectMatch = subjects.some((s: string) => s.includes(qLower));
        const classMatch = classes.some((c: string) => c.includes(qLower));
        const languageMatch = languages.some((l: string) => l.includes(qLower));
        
        return subjectMatch || classMatch || languageMatch;
      });

      // Update total count and apply pagination AFTER filtering
      finalTotal = filteredTutors.length;
      const skip = (page - 1) * pageSize;
      filteredTutors = filteredTutors.slice(skip, skip + pageSize);
    }

    const items = filteredTutors.map((t) => {
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

    return { items, meta: { page, pageSize, total: finalTotal, totalPages: Math.ceil(finalTotal / pageSize) } };
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
