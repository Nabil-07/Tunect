import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TutorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TrendingTutorDto } from './dto/trending-tutor.dto';
import { Cacheable } from '../common/cache.decorator';

export type TutorPublic = {
  id: string;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  subjects?: string[] | null;
  languages?: string[] | null;
  rating?: number | null;
  reviews?: number | null;
  hourlyRate?: number | null;
  avatarUrl?: string | null;
  country?: string | null;
};

function toNum(v: any, d = 0) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : d;
}

function normalizeTutor(row: any): TutorPublic {
  const subjectsArr: string[] = Array.isArray(row?.subjects) ? row.subjects : [];
  const languagesArr: string[] = Array.isArray(row?.languages) ? row.languages : [];
  const subject = row?.subject ?? (subjectsArr.length ? subjectsArr.join(', ') : null);

  const emailSource: string | null = (row?.email ?? row?.user?.email ?? null) as string | null;
  const fallbackName =
    emailSource
      ? emailSource.split('@')[0].replace(/\./g, ' ').replace(/^\w/, (c: string) =>
          c.toUpperCase(),
        )
      : null;

  const name = row?.user?.name ?? row?.name ?? fallbackName;

  const hourlyRate = toNum(row?.hourlyRate ?? row?.pricePerSessionTokens, null as any);
  const rating = toNum(row?.rating ?? row?.avgRating, null as any);
  const reviews = toNum(row?.reviews ?? row?.reviewCount ?? row?.reviewsCount, null as any);

  return {
    id: row.id,
    name: name ?? null,
    email: row?.email ?? row?.user?.email ?? null,
    subject,
    subjects: subjectsArr.length ? subjectsArr : null,
    languages: languagesArr.length ? languagesArr : null,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : null,
    rating: Number.isFinite(rating) ? rating : null,
    reviews: Number.isFinite(reviews) ? reviews : null,
    avatarUrl: row?.avatarUrl ?? row?.user?.avatarUrl ?? null,
    country: row?.country ?? null,
  };
}

@Injectable()
export class TutorsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- FILTER OPTIONS ----------
  @Cacheable('filter-options', 300) // Cache for 5 minutes
  async getFilterOptions() {
    // Get all approved tutors with their subjects, languages and reviews
    const tutors = await this.prisma.tutor.findMany({
      where: { status: TutorStatus.APPROVED },
      select: {
        subjects: true,
        languages: true,
        reviews: {
          select: { rating: true },
        },
      },
    });

    // Extract unique subjects
    const subjectsSet = new Set<string>();
    tutors.forEach((tutor) => {
      if (Array.isArray(tutor.subjects)) {
        tutor.subjects.forEach((subject) => {
          if (subject && subject.trim()) {
            subjectsSet.add(subject.trim());
          }
        });
      }
    });

    // Extract unique languages
    const languagesSet = new Set<string>();
    tutors.forEach((tutor) => {
      if (Array.isArray(tutor.languages)) {
        tutor.languages.forEach((language) => {
          if (language && language.trim()) {
            languagesSet.add(language.trim());
          }
        });
      }
    });

    // Calculate available rating thresholds
    const tutorRatings: number[] = [];
    tutors.forEach((tutor) => {
      if (tutor.reviews && tutor.reviews.length > 0) {
        const avgRating =
          tutor.reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / tutor.reviews.length;
        tutorRatings.push(avgRating);
      }
    });

    // Determine which rating filters should be available
    const ratingOptions = [
      { value: 0, label: 'Any rating', available: true },
      { value: 3, label: '3.0+', available: tutorRatings.some((r) => r >= 3) },
      { value: 4, label: '4.0+', available: tutorRatings.some((r) => r >= 4) },
      { value: 4.5, label: '4.5+', available: tutorRatings.some((r) => r >= 4.5) },
    ].filter((opt) => opt.available);

    return {
      subjects: Array.from(subjectsSet).sort(),
      languages: Array.from(languagesSet).sort(),
      ratingOptions: ratingOptions.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    };
  }

  // ---------- LIST ----------
  async list(params?: {
    page?: number;
    pageSize?: number;
    subject?: string;
    language?: string;
    sortBy?: 'updatedAt' | 'rating' | 'hourlyRate';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, Number(params?.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize ?? 8)));
    const skip = (page - 1) * pageSize;

    // ✅ Only tutors with APPROVED status
    const where: any = { status: TutorStatus.APPROVED };

    const andConditions: any[] = [];

    if (params?.subject && params.subject.trim()) {
      const s = params.subject.trim();
      andConditions.push({
        OR: [
          { subjects: { has: s } },
          { subjects: { has: s.toUpperCase() } },
          { subjects: { has: s.toLowerCase() } },
        ],
      });
    }

    if (params?.language && params.language.trim()) {
      const lang = params.language.trim();
      andConditions.push({
        OR: [
          { languages: { has: lang } },
          { languages: { has: lang.toUpperCase() } },
          { languages: { has: lang.toLowerCase() } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    let orderBy: any = { id: 'desc' as const };
    if (params?.sortBy === 'hourlyRate') {
      orderBy = { hourlyRate: params?.sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (params?.sortBy === 'updatedAt') {
      orderBy = { updatedAt: params?.sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (params?.sortBy === 'rating') {
      orderBy = { reviews: { _avg: { rating: params?.sortOrder === 'asc' ? 'asc' : 'desc' } } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.tutor.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { user: { select: { name: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.tutor.count({ where }),
    ]);

    return { items: rows.map(normalizeTutor), total, page, pageSize };
  }

  // ---------- SEARCH ----------
  async search(params?: {
    q?: string;
    subject?: string;
    language?: string;
    minRating?: number;
    priceMin?: number;
    priceMax?: number;
    sort?: 'rating_desc' | 'price_asc' | 'price_desc';
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize ?? 8)));
    const skip = (page - 1) * pageSize;

    // ✅ Only tutors with APPROVED status
    const where: any = { status: TutorStatus.APPROVED };
    const AND: any[] = [];
    const OR: any[] = [];

    if (params?.q && params.q.trim()) {
      const q = params.q.trim();
      OR.push(
        { bio: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { user: { is: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
      );
    }

    if (params?.subject && params.subject.trim()) {
      const s = params.subject.trim();
      OR.push(
        { subjects: { has: s } },
        { subjects: { has: s.toUpperCase() } },
        { subjects: { has: s.toLowerCase() } },
      );
    }

    if (params?.language && params.language.trim()) {
      const lang = params.language.trim();
      OR.push(
        { languages: { has: lang } },
        { languages: { has: lang.toUpperCase() } },
        { languages: { has: lang.toLowerCase() } },
      );
    }

    if (OR.length) AND.push({ OR });

    if (Number.isFinite(params?.priceMin) || Number.isFinite(params?.priceMax)) {
      const hr: any = {};
      if (Number.isFinite(params?.priceMin)) hr.gte = Number(params!.priceMin);
      if (Number.isFinite(params?.priceMax)) hr.lte = Number(params!.priceMax);
      AND.push({ hourlyRate: hr });
    }

    if (Number.isFinite(params?.minRating)) {
      AND.push({ reviews: { some: { rating: { gte: Number(params!.minRating) } } } });
    }

    if (AND.length) where.AND = AND;

    let orderBy: any = { id: 'desc' as const };
    if (params?.sort === 'price_asc') orderBy = { hourlyRate: 'asc' as const };
    if (params?.sort === 'price_desc') orderBy = { hourlyRate: 'desc' as const };
    if (params?.sort === 'rating_desc') {
      orderBy = { reviews: { _avg: { rating: 'desc' } } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.tutor.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { user: { select: { name: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.tutor.count({ where }),
    ]);

    return { items: rows.map(normalizeTutor), total, page, pageSize };
  }

  // ---------- DETAIL ----------
  async getByIdOrTid(idOrTid: string) {
    const byId = await this.prisma.tutor.findUnique({
      where: { id: idOrTid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (byId) return normalizeTutor(byId);

    const byTid = await this.prisma.tutor.findUnique({
      where: { tutorTid: idOrTid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (byTid) return normalizeTutor(byTid);

    throw new NotFoundException('Tutor not found');
  }

  // ---------- TRENDING ----------
  @Cacheable('trending', 120) // Cache for 2 minutes
  async getTrending(limit = 8): Promise<TrendingTutorDto[]> {
    const tutors = await this.prisma.tutor.findMany({
      where: { isTrending: true, status: TutorStatus.APPROVED },
      take: Math.min(Math.max(Number(limit) || 8, 1), 24),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        subjects: true,
        languages: true,
        hourlyRate: true,
        country: true,
        _count: { select: { reviews: true } },
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });

    // Fetch average ratings in bulk instead of loading all reviews
    const tutorIds = tutors.map(t => t.id);
    const ratings = tutorIds.length > 0 ? await this.prisma.review.groupBy({
      by: ['tutorId'],
      _avg: { rating: true },
      where: { tutorId: { in: tutorIds } },
    }) : [];

    const ratingMap = new Map(ratings.map(r => [r.tutorId, r._avg.rating ?? 4.7]));

    return tutors.map<TrendingTutorDto>((t) => {
      const avg = ratingMap.get(t.id) ?? 4.7;

      const fallbackName = t.user?.email
        ? t.user.email.split('@')[0].replace(/\./g, ' ').replace(/^\w/, (c) =>
            c.toUpperCase(),
          )
        : 'Tutor';

      return {
        id: t.id,
        name: t.user?.name ?? fallbackName,
        subject: t.subjects?.[0] ?? 'General',
        country: t.country ?? undefined,
        rating: Math.round(avg * 100) / 100,
        hourly: t.hourlyRate,
        img: t.user?.avatarUrl ?? undefined,
        badges: [],
      };
    });
  }

  // ---------- SESSIONS FOR LOGGED-IN TUTOR ----------
  async getSessionsForTutor(tutorId: string) {
    console.log('[getSessionsForTutor] Fetching bookings for tutorId:', tutorId);
    
    // Query bookings instead of sessions - bookings are the actual scheduled sessions
    const bookings = await this.prisma.booking.findMany({
      where: { 
        tutorId,
        // Only show bookings that have been confirmed with time slots
        startTime: { not: null },
        endTime: { not: null },
        status: { notIn: ['CANCELED'] }
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        isDemo: true,
        tutor: { select: { subjects: true } },
        student: {
          select: {
            id: true,
            user: { select: { name: true, email: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 100, // Limit to recent 100 sessions for performance
    });

    console.log('[getSessionsForTutor] Found', bookings.length, 'bookings');
    bookings.forEach((b, i) => {
      console.log(`  [${i}] id=${b.id}, status=${b.status}, isDemo=${b.isDemo}, start=${b.startTime}, end=${b.endTime}`);
    });

    const now = new Date();

    const result = bookings.map((booking) => {
      const studentName =
        booking.student?.user?.name ||
        (booking.student?.user?.email
          ? booking.student.user.email.split('@')[0].replace(/\./g, ' ').replace(/^\w/, (c: string) =>
              c.toUpperCase(),
            )
          : 'Student');

      const subject =
        Array.isArray(booking.tutor?.subjects) && booking.tutor.subjects.length
          ? booking.tutor.subjects[0]
          : 'Session';

      const status: 'UPCOMING' | 'COMPLETED' =
        new Date(booking.endTime!) > now ? 'UPCOMING' : 'COMPLETED';

      return {
        id: booking.id,
        studentName,
        subject,
        startTime: booking.startTime!.toISOString(),
        endTime: booking.endTime!.toISOString(),
        status,
        isDemo: booking.isDemo,
      };
    });

    console.log('[getSessionsForTutor] Returning', result.length, 'sessions');
    return result;
  }

  // ---------- ME (profile for logged-in tutor) ----------
  async getMe(tutorId: string) {
    const t = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    if (!t) throw new NotFoundException('Tutor not found for logged-in user');

    return {
      name: t.user?.name ?? null,
      email: t.user?.email ?? null,
      avatarUrl: t.user?.avatarUrl ?? null,
      bio: t.bio ?? null,
      subjects: t.subjects ?? [],
      languages: t.languages ?? [],
      hourlyRate: t.hourlyRate ?? null,
      country: t.country ?? null,
    };
  }

  async getMeByUserId(userId: string) {
    const t = await this.prisma.tutor.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    if (!t) throw new NotFoundException('Tutor not found for logged-in user');

    return {
      name: t.user?.name ?? null,
      email: t.user?.email ?? null,
      avatarUrl: t.user?.avatarUrl ?? null,
      bio: t.bio ?? null,
      subjects: t.subjects ?? [],
      languages: t.languages ?? [],
      hourlyRate: t.hourlyRate ?? null,
      country: t.country ?? null,
    };
  }

  async updateMe(userId: string, tutorIdOrNull: string | null, body: any) {
    const t = tutorIdOrNull
      ? await this.prisma.tutor.findUnique({
          where: { id: tutorIdOrNull },
          include: { user: true },
        })
      : await this.prisma.tutor.findUnique({
          where: { userId },
          include: { user: true },
        });
    if (!t) throw new NotFoundException('Tutor not found for logged-in user');

    const updatesTutor: any = {};
    const updatesUser: any = {};

    if (typeof body?.bio === 'string') updatesTutor.bio = body.bio;
    if (typeof body?.summary === 'string') updatesTutor.summary = body.summary;
    if (typeof body?.qualifications === 'string') updatesTutor.qualifications = body.qualifications;

    if (Array.isArray(body?.subjects)) {
      updatesTutor.subjects = body.subjects
        .map((s: any) => String(s).trim())
        .filter(Boolean);
    }

    if (Array.isArray(body?.languages)) {
      updatesTutor.languages = body.languages
        .map((l: any) => String(l).trim())
        .filter(Boolean);
    }

    if (Array.isArray(body?.degrees)) {
      updatesTutor.degrees = body.degrees
        .map((d: any) => String(d).trim())
        .filter(Boolean);
    }

    if (Array.isArray(body?.classesTeach)) {
      updatesTutor.classesTeach = body.classesTeach
        .map((c: any) => String(c).trim())
        .filter(Boolean);
    }

    if (body?.yearsExperience !== undefined && Number.isFinite(Number(body.yearsExperience))) {
      updatesTutor.yearsExperience = Number(body.yearsExperience);
    }

    if (body?.hourlyRate !== undefined && Number.isFinite(Number(body.hourlyRate))) {
      updatesTutor.hourlyRate = Number(body.hourlyRate);
    }

    if (typeof body?.country === 'string' && body.country.trim()) {
      updatesTutor.country = body.country.trim();
    }

    if (typeof body?.name === 'string') {
      updatesUser.name = body.name;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updatesUser).length) {
        await tx.user.update({ where: { id: userId }, data: updatesUser });
      }
      if (Object.keys(updatesTutor).length) {
        await tx.tutor.update({ where: { id: t.id }, data: updatesTutor });
      }
    });

    return this.getMe(t.id);
  }

  // ---------- AVAILABILITY ----------
  /**
   * Return upcoming availability slots for a tutor between optional from/to bounds.
   * Dates are returned as ISO strings.
   */
  async listAvailability(tutorId: string, from?: string, to?: string) {
    const where: any = { tutorId };
    if (from) where.startTime = { gte: new Date(from) };
    if (to) {
      where.endTime = where.endTime || {};
      where.endTime.lte = new Date(to);
    }

    const rows = await this.prisma.availabilitySlot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      select: { id: true, startTime: true, endTime: true },
    });

    // Ensure plain ISO strings (Nest/JSON would serialize Dates anyway, but be explicit)
    return rows.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
    }));
  }
}
