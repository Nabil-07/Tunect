import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TutorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TrendingTutorDto } from './dto/trending-tutor.dto';
import { Cacheable } from '../common/cache.decorator';
import { Logger } from '@nestjs/common';

export type TutorPublic = {
  id: string;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  subjects?: string[] | null;
  classesTeach?: string[] | null;
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
  const classesTeachArr: string[] = Array.isArray(row?.classesTeach) ? row.classesTeach : [];
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
    classesTeach: classesTeachArr.length ? classesTeachArr : null,
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
  private readonly logger = new Logger(TutorsService.name);
  
  constructor(private readonly prisma: PrismaService) {}

  private normalizeValue(value?: string | null): string {
    return (value || '').trim().toLowerCase();
  }

  private parseSearches(raw?: string): Array<{
    term?: string;
    subject?: string;
    classTeach?: string;
    language?: string;
    ts?: number;
  }> {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }

  // ---------- FILTER OPTIONS ----------
  @Cacheable('filter-options', 300) // Cache for 5 minutes
  async getFilterOptions() {
    // Get all approved tutors with their subjects, languages and reviews
    const tutors = await this.prisma.tutor.findMany({
      where: { status: TutorStatus.APPROVED },
      select: {
        subjects: true,
        classesTeach: true,
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
    const classesSet = new Set<string>();
    tutors.forEach((tutor) => {
      if (Array.isArray(tutor.languages)) {
        tutor.languages.forEach((language) => {
          if (language && language.trim()) {
            languagesSet.add(language.trim());
          }
        });
      }
      if (Array.isArray(tutor.classesTeach)) {
        tutor.classesTeach.forEach((cls) => {
          if (cls && cls.trim()) {
            classesSet.add(cls.trim());
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
      classesTeach: Array.from(classesSet).sort(),
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
    classTeach?: string;
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

    if (params?.classTeach && params.classTeach.trim()) {
      const cls = params.classTeach.trim();
      andConditions.push({
        OR: [
          { classesTeach: { has: cls } },
          { classesTeach: { has: cls.toUpperCase() } },
          { classesTeach: { has: cls.toLowerCase() } },
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

  async getRecommendedForStudent(
    userId: string,
    params?: { pageSize?: number; searches?: string },
  ) {
    const pageSize = Math.min(20, Math.max(1, Number(params?.pageSize ?? 6)));

    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true, grade: true },
    });

    const searches = this.parseSearches(params?.searches);

    const interestSubjects = new Set<string>();
    const interestClasses = new Set<string>();
    const interestLanguages = new Set<string>();
    const searchTerms = new Set<string>();
    const bookedTutorIds = new Set<string>();

    // Extract interests from recent searches
    searches.slice(0, 10).forEach((s) => {
      const term = this.normalizeValue(s?.term);
      const subject = this.normalizeValue(s?.subject);
      const classTeach = this.normalizeValue(s?.classTeach);
      const language = this.normalizeValue(s?.language);
      if (term) searchTerms.add(term);
      if (subject) interestSubjects.add(subject);
      if (classTeach) interestClasses.add(classTeach);
      if (language) interestLanguages.add(language);
    });

    // Use student grade as a weak hint for classTeach
    const studentGrade = this.normalizeValue(student?.grade);
    if (studentGrade) interestClasses.add(studentGrade);

    // Extract interests from recent bookings
    if (student?.id) {
      const recentBookings = await this.prisma.booking.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          tutorId: true,
          tutor: {
            select: {
              subjects: true,
              classesTeach: true,
              languages: true,
            },
          },
        },
      });

      recentBookings.forEach((b) => {
        if (b.tutorId) bookedTutorIds.add(b.tutorId);
        (b.tutor?.subjects || []).forEach((s) => {
          const v = this.normalizeValue(s);
          if (v) interestSubjects.add(v);
        });
        (b.tutor?.classesTeach || []).forEach((c) => {
          const v = this.normalizeValue(c);
          if (v) interestClasses.add(v);
        });
        (b.tutor?.languages || []).forEach((l) => {
          const v = this.normalizeValue(l);
          if (v) interestLanguages.add(v);
        });
      });
    }

    const hasSignals =
      interestSubjects.size > 0 ||
      interestClasses.size > 0 ||
      interestLanguages.size > 0 ||
      searchTerms.size > 0 ||
      bookedTutorIds.size > 0;

    // Fallback to default list if we have no signals
    if (!hasSignals) {
      return this.list({
        page: 1,
        pageSize,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    }

    const candidates = await this.prisma.tutor.findMany({
      where: { status: TutorStatus.APPROVED },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        reviews: { select: { rating: true } },
      },
    });

    const now = Date.now();

    const scored = candidates.map((t) => {
      const tutorSubjects = (t.subjects || []).map((s) => this.normalizeValue(s));
      const tutorClasses = (t.classesTeach || []).map((c) => this.normalizeValue(c));
      const tutorLanguages = (t.languages || []).map((l) => this.normalizeValue(l));

      let score = 0;

      // Subject match weight
      const subjectMatches = tutorSubjects.filter((s) => interestSubjects.has(s)).length;
      score += Math.min(subjectMatches, 3) * 5;

      // Class match weight
      const classMatches = tutorClasses.filter((c) => interestClasses.has(c)).length;
      score += Math.min(classMatches, 3) * 2;

      // Language match weight
      const languageMatches = tutorLanguages.filter((l) => interestLanguages.has(l)).length;
      score += Math.min(languageMatches, 3) * 1;

      // Search term match (subject or tutor name)
      const nameLower = this.normalizeValue(t.user?.name ?? '');
      const termMatches = Array.from(searchTerms).some((term) => {
        return (
          nameLower.includes(term) ||
          tutorSubjects.some((s) => s.includes(term))
        );
      });
      if (termMatches) score += 3;

      // Previously booked tutor bonus
      if (bookedTutorIds.has(t.id)) score += 6;

      // Rating weight
      const ratings = t.reviews?.map((r) => r.rating ?? 0) || [];
      const avgRating =
        ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;
      score += Math.max(0, avgRating);

      // Recency weight (updatedAt)
      const updatedAt = t.updatedAt ? new Date(t.updatedAt).getTime() : now;
      const daysSinceUpdate = Math.max(0, (now - updatedAt) / 86_400_000);
      const recencyScore = Math.max(0, 5 - daysSinceUpdate / 7);
      score += recencyScore;

      // Small bonus for review volume
      score += Math.min(2, ratings.length / 10);

      return { tutor: t, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const items = scored.slice(0, pageSize).map((s) => normalizeTutor(s.tutor));
    return { items, total: items.length, page: 1, pageSize };
  }

  // ---------- SEARCH ----------
  async search(params?: {
    q?: string;
    subject?: string;
    language?: string;
    classTeach?: string;
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

    // Text search (q) - can match bio OR tutor name (OR condition)
    if (params?.q && params.q.trim()) {
      const q = params.q.trim();
      AND.push({
        OR: [
          { bio: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { user: { is: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
        ],
      });
    }

    // Subject filter - MUST match (AND condition) - STRICT filtering
    // Tutor MUST have this subject in their subjects array
    if (params?.subject && params.subject.trim()) {
      const s = params.subject.trim();
      this.logger.log(`[search] Filtering by subject: "${s}"`);
      // Prisma's 'has' operator checks if array contains the exact value (case-sensitive)
      // Check multiple case variants to handle different storage formats
      AND.push({
        OR: [
          { subjects: { has: s } },
          { subjects: { has: s.toUpperCase() } },
          { subjects: { has: s.toLowerCase() } },
          { subjects: { has: s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() } }, // Capitalized (e.g., "Jee")
        ],
      });
    }

    // Language filter - MUST match (AND condition)
    if (params?.language && params.language.trim()) {
      const lang = params.language.trim();
      AND.push({
        OR: [
          { languages: { has: lang } },
          { languages: { has: lang.toUpperCase() } },
          { languages: { has: lang.toLowerCase() } },
        ],
      });
    }

    // Class filter - MUST match (AND condition)
    if (params?.classTeach && params.classTeach.trim()) {
      const cls = params.classTeach.trim();
      AND.push({
        OR: [
          { classesTeach: { has: cls } },
          { classesTeach: { has: cls.toUpperCase() } },
          { classesTeach: { has: cls.toLowerCase() } },
        ],
      });
    }

    if (Number.isFinite(params?.priceMin) || Number.isFinite(params?.priceMax)) {
      const hr: any = {};
      if (Number.isFinite(params?.priceMin)) hr.gte = Number(params!.priceMin);
      if (Number.isFinite(params?.priceMax)) hr.lte = Number(params!.priceMax);
      AND.push({ hourlyRate: hr });
    }

    if (Number.isFinite(params?.minRating)) {
      AND.push({ reviews: { some: { rating: { gte: Number(params!.minRating) } } } });
    }

    if (AND.length) {
      where.AND = AND;
      this.logger.debug(`[search] Applied ${AND.length} AND conditions:`, JSON.stringify(AND, null, 2));
    }

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

    // Post-query validation: Double-check subject filter matches (safety net)
    // This ensures that even if Prisma query has issues, we filter correctly
    let filteredRows = rows;
    if (params?.subject && params.subject.trim()) {
      const subjectLower = params.subject.trim().toLowerCase();
      const beforeFilter = filteredRows.length;
      filteredRows = filteredRows.filter((tutor) => {
        const tutorSubjects = (tutor.subjects || []).map((s: string) => s.toLowerCase());
        const matches = tutorSubjects.includes(subjectLower);
        if (!matches) {
          this.logger.warn(
            `[search] Backend filter failed: Tutor ${tutor.id} (${tutor.user?.name || 'Unknown'}) ` +
            `does NOT teach "${params.subject}" but was returned by Prisma query. ` +
            `Tutor subjects: [${(tutor.subjects || []).join(', ')}]`
          );
        }
        return matches;
      });
      if (filteredRows.length < beforeFilter) {
        this.logger.warn(
          `[search] Filtered out ${beforeFilter - filteredRows.length} tutors that didn't match subject "${params.subject}"`
        );
      }
    }

    return { items: filteredRows.map(normalizeTutor), total: filteredRows.length, page, pageSize };
  }

  // ---------- DETAIL ----------
  async getByIdOrTid(idOrTid: string) {
    // First try exact match by full ID
    const byId = await this.prisma.tutor.findUnique({
      where: { id: idOrTid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (byId) return normalizeTutor(byId);

    // Then try by tutorTid
    const byTid = await this.prisma.tutor.findUnique({
      where: { tutorTid: idOrTid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (byTid) return normalizeTutor(byTid);

    // Finally try finding by ID ending with the provided string (for slug-based lookups)
    const byIdEnding = await this.prisma.tutor.findFirst({
      where: { id: { endsWith: idOrTid } },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (byIdEnding) return normalizeTutor(byIdEnding);

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

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get active students count (students with confirmed/completed sessions)
    const activeStudentsResult = await this.prisma.booking.groupBy({
      by: ['studentId'],
      where: {
        tutorId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
      },
    });
    const activeStudentsCount = activeStudentsResult.length;

    // Completed sessions based on endTime (even if status not updated yet)
    const completedBookings = await this.prisma.booking.findMany({
      where: {
        tutorId,
        endTime: { not: null, lt: now },
        status: { not: 'CANCELED' },
        isDemo: false,
      },
      select: {
        id: true,
        endTime: true,
        isDemo: true,
        tokensCharged: true,
        tutor: { select: { hourlyRate: true } },
      },
    });

    const sessionsCompleted = completedBookings.length;

    const platformFeePercent = (hourlyRate?: number | null) => {
      const defaultFee = Number(process.env.FEE_PERCENT ?? 20);
      const rate = Number(hourlyRate ?? 0);
      if (!Number.isFinite(rate) || rate <= 0) return defaultFee;
      if (rate < 400) return 25;
      if (rate < 700) return 18;
      return 15;
    };

    const totalEarnings = completedBookings.reduce((sum, b) => {
      const tokens = Number(b.tokensCharged || 0);
      if (!tokens) return sum;
      const fee = platformFeePercent(b.tutor?.hourlyRate ?? null);
      const share = Math.max(0, (tokens * (100 - fee)) / 100);
      return sum + share;
    }, 0);

    const monthlyBookings = completedBookings.filter((b) => b.endTime && new Date(b.endTime) >= startOfMonth);
    const monthlyEarnings = monthlyBookings.reduce((sum, b) => {
      const tokens = Number(b.tokensCharged || 0);
      if (!tokens) return sum;
      const fee = platformFeePercent(b.tutor?.hourlyRate ?? null);
      const share = Math.max(0, (tokens * (100 - fee)) / 100);
      return sum + share;
    }, 0);

    // Get rating and reviews
    const reviews = await this.prisma.review.findMany({
      where: { tutorId },
      select: { rating: true },
    });
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    return {
      name: t.user?.name ?? null,
      email: t.user?.email ?? null,
      avatarUrl: t.user?.avatarUrl ?? null,
      bio: t.bio ?? null,
      subjects: t.subjects ?? [],
      languages: t.languages ?? [],
      hourlyRate: t.hourlyRate ?? null,
      country: t.country ?? null,
      // Dashboard stats
      activeStudents: activeStudentsCount,
      totalEarnings,
      sessionsCompleted,
      monthlyEarnings,
      rating: parseFloat(averageRating.toFixed(1)),
      reviews: reviews.length,
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

  // ---------- TUTOR ACTIVITY INFO ----------
  async getActivityInfo(tutorId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get last active date (last booking or slot creation)
    const [lastBooking, lastSlot] = await Promise.all([
      this.prisma.booking.findFirst({
        where: {
          tutorId,
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.availabilitySlot.findFirst({
        where: {
          tutorId,
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    
    const lastActive = lastBooking?.createdAt || lastSlot?.createdAt || null;
    
    // Calculate activity frequency (days active in last 30 days)
    const activeDays = new Set<string>();
    
    // Count days from bookings
    const bookings = await this.prisma.booking.findMany({
      where: {
        tutorId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });
    bookings.forEach(b => {
      const day = b.createdAt.toISOString().split('T')[0];
      activeDays.add(day);
    });
    
    // Count days from slots
    const slots = await this.prisma.availabilitySlot.findMany({
      where: {
        tutorId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });
    slots.forEach(s => {
      const day = s.createdAt.toISOString().split('T')[0];
      activeDays.add(day);
    });
    
    const activeDaysCount = activeDays.size;
    let activityFrequency = 'Inactive';
    if (activeDaysCount >= 20) {
      activityFrequency = 'Active almost daily';
    } else if (activeDaysCount >= 10) {
      activityFrequency = 'Active frequently';
    } else if (activeDaysCount >= 5) {
      activityFrequency = 'Active 2-3 days per week';
    } else if (activeDaysCount >= 1) {
      activityFrequency = 'Active occasionally';
    }
    
    return {
      lastActiveDate: lastActive?.toISOString() || null,
      activeDaysCount,
      activityFrequency,
    };
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

    const windowStart = from ? new Date(from) : new Date(Date.now());
    const windowEnd = to ? new Date(to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const templates = await this.prisma.recurringTemplate.findMany({
      where: { tutorId, isActive: true },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    });

    const templateSlots: Array<{ startTime: Date; endTime: Date }> = [];
    if (templates.length > 0) {
      const cursor = new Date(windowStart);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(windowEnd);
      endDay.setHours(0, 0, 0, 0);

      for (let d = new Date(cursor); d <= endDay; d.setDate(d.getDate() + 1)) {
        const dayTemplates = templates.filter((t) => t.dayOfWeek === d.getDay());
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
          templateSlots.push({ startTime: start, endTime: end });
        }
      }
    }

    const dedupe = new Set<string>();
    const merged = [...rows, ...templateSlots]
      .filter((s) => {
        const key = `${s.startTime.toISOString()}::${s.endTime.toISOString()}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Ensure plain ISO strings (Nest/JSON would serialize Dates anyway, but be explicit)
    return merged.map((s) => ({
      id: 'id' in s ? (s as any).id : undefined,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
    }));
  }
}
