import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus, TutorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TrendingTutorDto } from './dto/trending-tutor.dto';
import { Cacheable } from '../common/cache.decorator';
import { UploadsService } from '../uploads/uploads.service';

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

function parseAttendance(data: unknown): { studentJoinedAt?: string; tutorJoinedAt?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const attendance = (data as { attendance?: unknown }).attendance;
  if (!attendance || typeof attendance !== 'object' || Array.isArray(attendance)) return {};
  const att = attendance as Record<string, unknown>;
  return {
    studentJoinedAt: typeof att.studentJoinedAt === 'string' ? att.studentJoinedAt : undefined,
    tutorJoinedAt: typeof att.tutorJoinedAt === 'string' ? att.tutorJoinedAt : undefined,
  };
}

function hasVerifiedAttendance(data: unknown): boolean {
  const attendance = parseAttendance(data);
  return !!attendance.studentJoinedAt && !!attendance.tutorJoinedAt;
}

function normalizeTutor(row: any): TutorPublic { // NOSONAR
  const subjectsArr: string[] = Array.isArray(row?.subjects) ? row.subjects : [];
  const classesTeachArr: string[] = Array.isArray(row?.classesTeach) ? row.classesTeach : [];
  const languagesArr: string[] = Array.isArray(row?.languages) ? row.languages : [];
  const subject = row?.subject ?? (subjectsArr.length ? subjectsArr.join(', ') : null);

  const emailSource: string | null = (row?.email ?? row?.user?.email ?? null) as string | null;
  const fallbackName =
    emailSource
      ? emailSource
          .split('@')[0]
          .replaceAll('.', ' ')
          .replace(/^\w/, (c: string) => c.toUpperCase())
      : null;

  const name = row?.user?.name ?? row?.name ?? fallbackName;

  const hourlyRate = toNum(row?.hourlyRate ?? row?.pricePerSessionTokens, null as any);

  // Check if reviewCount was explicitly provided (from aggregation)
  const explicitReviewCount = row?.reviewCount;
  const reviewsArray = Array.isArray(row?.reviews) ? row.reviews : null;
  
  // Calculate review count: prefer explicit reviewCount, then array length, then fallback
  let reviewsCount: number;
  if (Number.isFinite(explicitReviewCount)) {
    reviewsCount = explicitReviewCount;
  } else if (reviewsArray?.length) {
    reviewsCount = reviewsArray.length;
  } else {
    reviewsCount = toNum(row?.reviewsCount, 0);
  }
  
  // Calculate rating: prefer explicit rating, then avgRating, then calculate from reviews array
  const avgRatingFromReviews = reviewsArray?.length
    ? reviewsArray.reduce((sum: number, r: any) => sum + Number(r?.rating ?? 0), 0) / reviewsArray.length
    : null;
  const rating = toNum(row?.rating ?? row?.avgRating ?? avgRatingFromReviews, null as any);
  
  // Final reviews count - default to 0 if no reviews
  const reviews = Number.isFinite(reviewsCount) ? reviewsCount : 0;

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
    reviews: Number.isFinite(reviews as any) ? reviews : null,
    avatarUrl: row?.avatarUrl ?? row?.user?.avatarUrl ?? null,
    country: row?.country ?? null,
  };
}

@Injectable()
export class TutorsService {
  private readonly logger = new Logger(TutorsService.name);
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  private normalizeValue(value?: string | null): string {
    return (value || '').trim().toLowerCase();
  }

  private async withReadableAvatar(tutor: TutorPublic): Promise<TutorPublic> {
    if (!tutor?.avatarUrl) {
      return tutor;
    }

    const readableAvatarUrl = await this.uploadsService.toReadableReference(tutor.avatarUrl);
    return {
      ...tutor,
      avatarUrl: readableAvatarUrl,
    };
  }

  private async withReadableAvatars(tutors: TutorPublic[]): Promise<TutorPublic[]> {
    return Promise.all(tutors.map((tutor) => this.withReadableAvatar(tutor)));
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
          if (subject?.trim()) {
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
          if (language?.trim()) {
            languagesSet.add(language.trim());
          }
        });
      }
      if (Array.isArray(tutor.classesTeach)) {
        tutor.classesTeach.forEach((cls) => {
          if (cls?.trim()) {
            classesSet.add(cls.trim());
          }
        });
      }
    });

    // Calculate available rating thresholds
    const tutorRatings: number[] = [];
    tutors.forEach((tutor) => {
      if (tutor.reviews?.length) {
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
      subjects: Array.from(subjectsSet).sort((a, b) => a.localeCompare(b)),
      classesTeach: Array.from(classesSet).sort((a, b) => a.localeCompare(b)),
      languages: Array.from(languagesSet).sort((a, b) => a.localeCompare(b)),
      ratingOptions: ratingOptions.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    };
  }

  // ---------- LIST ----------
  async list(params?: { // NOSONAR
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

    if (params?.subject?.trim()) {
      const s = params.subject.trim();
      andConditions.push({
        OR: [
          { subjects: { has: s } },
          { subjects: { has: s.toUpperCase() } },
          { subjects: { has: s.toLowerCase() } },
        ],
      });
    }

    if (params?.language?.trim()) {
      const lang = params.language.trim();
      andConditions.push({
        OR: [
          { languages: { has: lang } },
          { languages: { has: lang.toUpperCase() } },
          { languages: { has: lang.toLowerCase() } },
        ],
      });
    }

    if (params?.classTeach?.trim()) {
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
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
          reviews: { select: { rating: true } },
        },
      }),
      this.prisma.tutor.count({ where }),
    ]);

    // Aggregate reviews for each tutor
    const rowsWithReviews = rows.map((row) => {
      const reviewsArray = Array.isArray(row?.reviews) ? row.reviews : [];
      const ratings = reviewsArray.map((r: any) => r?.rating ?? 0).filter((r: number) => r > 0);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length 
        : null;
      const reviewCount = ratings.length;
      return {
        ...row,
        rating: avgRating,
        reviewCount,
      };
    });

    const normalizedItems = rowsWithReviews.map(normalizeTutor);
    const items = await this.withReadableAvatars(normalizedItems);
    return { items, total, page, pageSize };
  }

  async getRecommendedForStudent(
    userId: string,
    params?: { pageSize?: number; searches?: string },
  ) {
    try {
      if (!userId) {
        this.logger.warn('[getRecommendedForStudent] No userId provided');
        // Return empty list if no userId
        return { items: [], total: 0, page: 1, pageSize: 6 };
      }

      const pageSize = Math.min(20, Math.max(1, Number(params?.pageSize ?? 6)));

      let student;
      try {
        student = await this.prisma.student.findUnique({
          where: { userId },
          select: { id: true, grade: true },
        });
      } catch (dbError: any) {
        this.logger.error(`[getRecommendedForStudent] Database error fetching student:`, dbError?.message);
        this.logger.error(`[getRecommendedForStudent] userId:`, userId);
        // Continue with student as null - this is valid if student doesn't exist yet
        student = null;
      }

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
      },
    });

    const candidateIds = candidates.map((c) => c.id);
    const reviewStats = candidateIds.length
      ? await this.prisma.review.groupBy({
          by: ['tutorId'],
          _avg: { rating: true },
          _count: { _all: true },
          where: { tutorId: { in: candidateIds } },
        })
      : [];
    const reviewStatsMap = new Map(
      reviewStats.map((r) => [r.tutorId, { avg: r._avg.rating ?? null, count: r._count._all }]),
    );

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
      const stats = reviewStatsMap.get(t.id);
      const avgRating = Number(stats?.avg ?? 0);
      const reviewCount = Number(stats?.count ?? 0);
      score += Math.max(0, avgRating);

      // Recency weight (updatedAt)
      const updatedAt = t.updatedAt ? new Date(t.updatedAt).getTime() : now;
      const daysSinceUpdate = Math.max(0, (now - updatedAt) / 86_400_000);
      const recencyScore = Math.max(0, 5 - daysSinceUpdate / 7);
      score += recencyScore;

      // Small bonus for review volume
      score += Math.min(2, reviewCount / 10);

      return { 
        tutor: {
          ...t,
          rating: Number.isFinite(avgRating) ? avgRating : null,
          reviewCount,
        }, 
        score 
      };
    });

      scored.sort((a, b) => b.score - a.score);

      const normalizedItems = scored.slice(0, pageSize).map((s) => normalizeTutor(s.tutor));
      const items = await this.withReadableAvatars(normalizedItems);
      return { items, total: items.length, page: 1, pageSize };
    } catch (error: any) {
      this.logger.error(`[getRecommendedForStudent] Error:`, error?.message);
      this.logger.error(`[getRecommendedForStudent] Error details:`, {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
      });
      this.logger.error(`[getRecommendedForStudent] userId:`, userId);
      this.logger.error(`[getRecommendedForStudent] params:`, params);
      // Return empty list on error instead of throwing to prevent 500
      // This allows the endpoint to return gracefully even if there's an issue
      return { items: [], total: 0, page: 1, pageSize: params?.pageSize ?? 6 };
    }
  }

  // ---------- SEARCH ----------
  async search(params?: { // NOSONAR
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
    try {
      const page = Math.max(1, Number(params?.page ?? 1));
      const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize ?? 8)));
      const skip = (page - 1) * pageSize;

      // ✅ Only tutors with APPROVED status
      const where: any = { status: TutorStatus.APPROVED };
      const AND: any[] = [];

      // Text search (q) - handled in post-query filter for reliable partial matching
      // We don't add q filter to Prisma query since 'has' only does exact array matches
      // and doesn't support partial matching (e.g., "Math" matching "Mathematics")
      const qSearchTerm = params?.q?.trim() || null;

      // Subject filter - MUST match (AND condition) - STRICT filtering
      // Tutor MUST have this subject in their subjects array
      if (params?.subject?.trim()) {
        const s = params.subject.trim();
        this.logger.log(`[search] Filtering by subject: "${s}"`);
        // Prisma's 'has' operator checks if array contains the exact value (case-sensitive)
        // Check multiple case variants to handle different storage formats
        // Also handle URL-encoded spaces (e.g., "Applied+Mathematics" -> "Applied Mathematics")
        const subjectVariants = [
          s,
          s.toUpperCase(),
          s.toLowerCase(),
          s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), // Capitalized (e.g., "Jee")
          // Handle spaces: both with and without spaces
          s.replaceAll(/\s+/g, ' '), // Normalize multiple spaces
          s.replaceAll(/\s+/g, ''), // Remove spaces entirely
        ];
        // Remove duplicates
        const uniqueVariants = [...new Set(subjectVariants)];
        this.logger.debug(`[search] Subject variants to check:`, uniqueVariants);
        AND.push({
          OR: uniqueVariants.map(variant => ({ subjects: { has: variant } })),
        });
      }

      // Language filter - MUST match (AND condition)
      if (params?.language?.trim()) {
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
      if (params?.classTeach?.trim()) {
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

      if (Number.isFinite(params?.minRating) && Number(params!.minRating) > 0) {
        AND.push({ reviews: { some: { rating: { gte: Number(params!.minRating) } } } });
      }

      if (AND.length) {
        where.AND = AND;
        this.logger.debug(`[search] Applied ${AND.length} AND conditions:`, JSON.stringify(AND, null, 2));
      }

      let orderBy: any = { id: 'desc' as const };
      if (params?.sort === 'price_asc') orderBy = { hourlyRate: 'asc' as const };
      if (params?.sort === 'price_desc') orderBy = { hourlyRate: 'desc' as const };
      const shouldSortByRating = params?.sort === 'rating_desc';

      // When text search (q) is used, we need to fetch all tutors and filter in application code
      // because Prisma's 'has' operator only supports exact matches, not partial matching.
      // Always apply text search when q is provided (even if subject filter is set).
      const needsTextSearchFilter = !!qSearchTerm;
      const needsAppPagination = needsTextSearchFilter || shouldSortByRating;
      
      this.logger.log(`[search] Params: q="${qSearchTerm}", subject="${params?.subject}", needsTextSearchFilter=${needsTextSearchFilter}`);
      
      this.logger.log(`[search] Executing query - Skip: ${needsAppPagination ? 0 : skip}, Take: ${needsAppPagination ? 1000 : pageSize}, SortByRating: ${shouldSortByRating}`);
      
      let rows: any[] = [];
      let total = 0;
      
      try {
        [rows, total] = await Promise.all([
          this.prisma.tutor.findMany({
            where,
            orderBy,
            // When doing text search, fetch more records to filter from (skip pagination at DB level)
            skip: needsAppPagination ? 0 : skip,
            take: needsAppPagination ? 1000 : pageSize, // Fetch up to 1000 for app-side filtering/sorting
            include: {
              user: { select: { name: true, email: true, avatarUrl: true } },
              reviews: { select: { rating: true } },
            },
          }),
          this.prisma.tutor.count({ where }),
        ]);
      } catch (dbError: any) {
        this.logger.error(`[search] Database query failed:`, dbError?.message);
        this.logger.error(`[search] Database error stack:`, dbError?.stack);
        this.logger.error(`[search] Query where clause:`, JSON.stringify(where, null, 2));
        throw new Error(`Database query failed: ${dbError?.message || 'Unknown database error'}`);
      }
      
      this.logger.log(`[search] Fetched ${rows.length} tutors, total: ${total}`);

      // Post-query validation: Double-check subject filter matches (safety net)
      // Also apply partial matching for text search (q parameter) on subjects/classes/languages
      let filteredRows = rows;
      let finalTotal = total; // Track total count, may be updated for partial matching
      
      // Apply subject filter validation
      if (params?.subject?.trim()) {
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
          finalTotal = filteredRows.length; // Update total after subject filter
          this.logger.warn(
            `[search] Filtered out ${beforeFilter - filteredRows.length} tutors that didn't match subject "${params.subject}"`
          );
        }
      }

      // Apply class filter validation
      if (params?.classTeach?.trim()) {
        const classLower = params.classTeach.trim().toLowerCase();
        const beforeFilter = filteredRows.length;
        filteredRows = filteredRows.filter((tutor) => {
          const tutorClasses = (tutor.classesTeach || []).map((c: string) => c.toLowerCase());
          const matches = tutorClasses.includes(classLower);
          if (!matches) {
            this.logger.warn(
              `[search] Backend filter failed: Tutor ${tutor.id} (${tutor.user?.name || 'Unknown'}) ` +
              `does NOT teach class "${params.classTeach}" but was returned by Prisma query. ` +
              `Tutor classes: [${(tutor.classesTeach || []).join(', ')}]`
            );
          }
          return matches;
        });
        if (filteredRows.length < beforeFilter) {
          finalTotal = filteredRows.length; // Update total after class filter
          this.logger.warn(
            `[search] Filtered out ${beforeFilter - filteredRows.length} tutors that didn't match class "${params.classTeach}"`
          );
        }
      }

      // Apply text search (q parameter) filtering for partial matches on bio, name, subjects, classes, languages
      // This handles cases where user searches "Math" and tutor has "Mathematics" or "Applied Mathematics"
      if (needsTextSearchFilter) {
        const qLower = (qSearchTerm ?? '').toLowerCase();
        this.logger.log(`[search] Applying text search filter for: "${qSearchTerm}" (lowercase: "${qLower}")`);
        this.logger.log(`[search] Filtering ${filteredRows.length} tutors...`);
        
        // Filter current results by partial match
        const beforeFilter = filteredRows.length;
        filteredRows = filteredRows.filter((tutor) => {
          // Check bio and name
          const bioMatch = tutor.bio?.toLowerCase()?.includes(qLower) ?? false;
          const nameMatch = tutor.user?.name?.toLowerCase()?.includes(qLower) ?? false;
          
          if (bioMatch || nameMatch) {
            return true;
          }
          
          // Check partial matches in subjects, classes, or languages
          const subjects = (tutor.subjects || []).map((s: string) => String(s || '').toLowerCase()).filter(Boolean);
          const classes = (tutor.classesTeach || []).map((c: string) => String(c || '').toLowerCase()).filter(Boolean);
          const languages = (tutor.languages || []).map((l: string) => String(l || '').toLowerCase()).filter(Boolean);
          
          const subjectMatch = subjects.some((s: string) => s.includes(qLower));
          const classMatch = classes.some((c: string) => c.includes(qLower));
          const languageMatch = languages.some((l: string) => l.includes(qLower));
          
          const matches = subjectMatch || classMatch || languageMatch;
          
          // Log matches for debugging
          if (matches) {
            this.logger.debug(`[search] Match found: Tutor ${tutor.id} (subjects: [${subjects.join(', ')}])`);
          }
          
          return matches;
        });
        
        // Update total and apply pagination after filtering
        finalTotal = filteredRows.length;
        this.logger.log(`[search] Text search: ${beforeFilter} → ${finalTotal} tutors after filter`);
        if (!shouldSortByRating) {
          filteredRows = filteredRows.slice(skip, skip + pageSize);
          this.logger.log(`[search] Returning ${filteredRows.length} tutors for page ${page}`);
        }
      }

      // Aggregate reviews for each tutor
      const rowsWithReviews = filteredRows.map((row) => {
        const reviewsArray = Array.isArray(row?.reviews) ? row.reviews : [];
        const ratings = reviewsArray.map((r: any) => r?.rating ?? 0).filter((r: number) => r > 0);
        const avgRating = ratings.length > 0 
          ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length 
          : null;
        const reviewCount = ratings.length;
        return {
          ...row,
          rating: avgRating,
          reviewCount,
        };
      });

      const sortedRows = shouldSortByRating
        ? [...rowsWithReviews].sort((a, b) => {
            const ar = a.rating ?? -1;
            const br = b.rating ?? -1;
            if (br !== ar) return br - ar;
            return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
          })
        : rowsWithReviews;

      const pagedRows = shouldSortByRating ? sortedRows.slice(skip, skip + pageSize) : sortedRows;

      const normalizedItems = pagedRows.map(normalizeTutor);
      const items = await this.withReadableAvatars(normalizedItems);
      return { items, total: finalTotal, page, pageSize };
    } catch (error: any) {
      this.logger.error(`[search] Error in search method:`, error);
      this.logger.error(`[search] Error message:`, error?.message);
      this.logger.error(`[search] Error stack:`, error?.stack);
      this.logger.error(`[search] Search params:`, JSON.stringify(params, null, 2));
      // Re-throw with more context
      const enhancedError = new Error(
        `Tutor search failed: ${error?.message || 'Unknown error'}. Params: ${JSON.stringify(params)}`
      );
      (enhancedError as any).originalError = error;
      throw enhancedError;
    }
  }

  // ---------- DETAIL ----------
  async getByIdOrTid(idOrTid: string) { // NOSONAR
    // First try exact match by full ID
    const byId = await this.prisma.tutor.findUnique({
      where: { id: idOrTid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        reviews: { select: { rating: true } },
      },
    });
    if (byId) {
      const reviewsArray = Array.isArray(byId?.reviews) ? byId.reviews : [];
      const ratings = reviewsArray.map((r: any) => r?.rating ?? 0).filter((r: number) => r > 0);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length 
        : null;
      const reviewCount = ratings.length;
      return this.withReadableAvatar(normalizeTutor({ ...byId, rating: avgRating, reviewCount }));
    }

    // Then try by tutorTid
    const byTid = await this.prisma.tutor.findUnique({
      where: { tutorTid: idOrTid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        reviews: { select: { rating: true } },
      },
    });
    if (byTid) {
      const reviewsArray = Array.isArray(byTid?.reviews) ? byTid.reviews : [];
      const ratings = reviewsArray.map((r: any) => r?.rating ?? 0).filter((r: number) => r > 0);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length 
        : null;
      const reviewCount = ratings.length;
      return this.withReadableAvatar(normalizeTutor({ ...byTid, rating: avgRating, reviewCount }));
    }

    // Finally try finding by ID ending with the provided string (for slug-based lookups)
    // CUIDs are lowercase, but normalize input to lowercase for matching
    const idLower = idOrTid.toLowerCase();
    const byIdEnding = await this.prisma.tutor.findFirst({
      where: { 
        OR: [
          { id: { endsWith: idOrTid } },
          { id: { endsWith: idLower } },
        ]
      },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        reviews: { select: { rating: true } },
      },
    });
    if (byIdEnding) {
      const reviewsArray = Array.isArray(byIdEnding?.reviews) ? byIdEnding.reviews : [];
      const ratings = reviewsArray.map((r: any) => r?.rating ?? 0).filter((r: number) => r > 0);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length 
        : null;
      const reviewCount = ratings.length;
      return this.withReadableAvatar(normalizeTutor({ ...byIdEnding, rating: avgRating, reviewCount }));
    }

    // Last resort: try finding by tutorTid if the input looks like it might be a TID
    if (idOrTid.length <= 10) {
      const byTidFallback = await this.prisma.tutor.findFirst({
        where: { 
          OR: [
            { tutorTid: idOrTid },
            { tutorTid: idLower },
          ]
        },
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
          reviews: { select: { rating: true } },
        },
      });
      if (byTidFallback) {
        const reviewsArray = Array.isArray(byTidFallback?.reviews) ? byTidFallback.reviews : [];
        const ratings = reviewsArray.map((r: any) => r?.rating ?? 0).filter((r: number) => r > 0);
        const avgRating = ratings.length > 0 
          ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length 
          : null;
        const reviewCount = ratings.length;
        return this.withReadableAvatar(normalizeTutor({ ...byTidFallback, rating: avgRating, reviewCount }));
      }
    }

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

    const trendingTutors = await Promise.all(tutors.map(async (t) => {
      const avg = ratingMap.get(t.id) ?? 4.7;

      const fallbackName = t.user?.email
        ? t.user.email
            .split('@')[0]
            .replaceAll('.', ' ')
            .replace(/^\w/, (c) => c.toUpperCase())
        : 'Tutor';

      const img = t.user?.avatarUrl
        ? await this.uploadsService.toReadableReference(t.user.avatarUrl)
        : undefined;

      return {
        id: t.id,
        name: t.user?.name ?? fallbackName,
        subject: t.subjects?.[0] ?? 'General',
        country: t.country ?? undefined,
        rating: Math.round(avg * 100) / 100,
        hourly: t.hourlyRate,
        img,
        badges: [],
      };
    }));

    return trendingTutors;
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
        whiteboardSessions: {
          take: 1,
          select: { data: true },
        },
        tutor: { select: { subjects: true } },
        student: {
          select: {
            id: true,
            grade: true,
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
          ? booking.student.user.email
              .split('@')[0]
              .replaceAll('.', ' ')
              .replace(/^\w/, (c: string) => c.toUpperCase())
          : 'Student');

      const subject =
        Array.isArray(booking.tutor?.subjects) && booking.tutor.subjects.length
          ? booking.tutor.subjects[0]
          : 'Session';

      let status: 'UPCOMING' | 'COMPLETED' | 'PENDING_SLOT' | 'CONFIRMED' = 'CONFIRMED';
      if (booking.status === BookingStatus.PENDING_SLOT) {
        status = 'PENDING_SLOT';
      } else if (booking.status === BookingStatus.COMPLETED) {
        status = hasVerifiedAttendance(booking.whiteboardSessions?.[0]?.data)
          ? 'COMPLETED'
          : 'CONFIRMED';
      } else if (
        booking.status === BookingStatus.CONFIRMED ||
        booking.status === BookingStatus.WAITING_ROOM ||
        booking.status === BookingStatus.LIVE
      ) {
        status = new Date(booking.endTime!) > now ? 'UPCOMING' : 'CONFIRMED';
      }

      return {
        id: booking.id,
        studentName,
        studentGrade: booking.student?.grade ?? null,
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

    // Active students should reflect actual attended classes, not merely scheduled sessions
    const attendedCompletedForActive = await this.prisma.booking.findMany({
      where: {
        tutorId,
        status: BookingStatus.COMPLETED,
      },
      select: {
        studentId: true,
        whiteboardSessions: {
          take: 1,
          select: { data: true },
        },
      },
    });
    const activeStudentsCount = new Set(
      attendedCompletedForActive
        .filter((b) => hasVerifiedAttendance(b.whiteboardSessions?.[0]?.data))
        .map((b) => b.studentId),
    ).size;

    const completedBookings = await this.prisma.booking.findMany({
      where: {
        tutorId,
        status: BookingStatus.COMPLETED,
        isDemo: false,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        isDemo: true,
        tokensCharged: true,
        tutor: { select: { hourlyRate: true } },
        whiteboardSessions: {
          take: 1,
          select: { data: true },
        },
      },
    });

    const attendedCompletedBookings = completedBookings.filter((b) =>
      hasVerifiedAttendance(b.whiteboardSessions?.[0]?.data),
    );

    const sessionsCompleted = attendedCompletedBookings.length;

    // ✅ Get actual earnings from wallet + payouts (source of truth)
    const wallet = await this.prisma.tutorWallet.findUnique({
      where: { tutorId },
    });
    const unpaidAmount = wallet ? Number(wallet.balance) : 0;

    const payouts = await this.prisma.payout.findMany({
      where: { tutorId },
    });
    const totalPaidOut = payouts.reduce((sum, p) => sum + Number(p.amount), 0);

    // Total earnings = unpaid balance + already paid out
    const totalEarnings = unpaidAmount + totalPaidOut;

    // Monthly earnings = monthly wallet ledger entries + monthly payouts
    const monthlyLedgerEntries = await this.prisma.tutorWalletLedger.findMany({
      where: {
        tutorId,
        createdAt: { gte: startOfMonth },
      },
    });
    const monthlyLedgerSum = monthlyLedgerEntries.reduce((sum, entry) => sum + Number(entry.delta), 0);

    const monthlyPayouts = payouts.filter((p) => {
      const paidAt = p.paidAt || p.createdAt;
      return paidAt >= startOfMonth;
    });
    const monthlyPaidOut = monthlyPayouts.reduce((sum, p) => sum + Number(p.amount), 0);

    const monthlyEarnings = monthlyLedgerSum + monthlyPaidOut;

    // Get rating and reviews
    const reviews = await this.prisma.review.findMany({
      where: { tutorId },
      select: { rating: true },
    });
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    const readableAvatarUrl = t.user?.avatarUrl
      ? await this.uploadsService.toReadableReference(t.user.avatarUrl, t.userId, 'TUTOR')
      : null;

    return {
      name: t.user?.name ?? null,
      email: t.user?.email ?? null,
      avatarUrl: readableAvatarUrl,
      status: t.status ?? null,
      bio: t.bio ?? null,
      summary: t.summary ?? null,
      subjects: t.subjects ?? [],
      languages: t.languages ?? [],
      degrees: t.degrees ?? [],
      classesTeach: t.classesTeach ?? [],
      qualifications: t.qualifications ?? null,
      yearsExperience: t.yearsExperience ?? null,
      hourlyRate: t.hourlyRate ?? null,
      country: t.country ?? null,
      // Dashboard stats
      activeStudents: activeStudentsCount,
      totalEarnings,
      sessionsCompleted,
      monthlyEarnings,
      rating: Number.parseFloat(averageRating.toFixed(1)),
      reviews: reviews.length,
    };
  }

  async getMeByUserId(userId: string) {
    const t = await this.prisma.tutor.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    if (!t) throw new NotFoundException('Tutor not found for logged-in user');

    const readableAvatarUrl = t.user?.avatarUrl
      ? await this.uploadsService.toReadableReference(t.user.avatarUrl, userId, 'TUTOR')
      : null;

    return {
      name: t.user?.name ?? null,
      email: t.user?.email ?? null,
      avatarUrl: readableAvatarUrl,
      status: t.status ?? null,
      bio: t.bio ?? null,
      summary: t.summary ?? null,
      subjects: t.subjects ?? [],
      languages: t.languages ?? [],
      degrees: t.degrees ?? [],
      classesTeach: t.classesTeach ?? [],
      qualifications: t.qualifications ?? null,
      yearsExperience: t.yearsExperience ?? null,
      hourlyRate: t.hourlyRate ?? null,
      country: t.country ?? null,
    };
  }

  async updateMe(userId: string, tutorIdOrNull: string | null, body: any) { // NOSONAR
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
    const incomingTutorId = tutorId?.trim();
    const incomingTutorIdLower = incomingTutorId.toLowerCase();

    const resolvedTutor = await this.prisma.tutor.findFirst({
      where: {
        OR: [
          { id: incomingTutorId },
          { tutorTid: incomingTutorId },
          { id: { endsWith: incomingTutorId } },
          { id: { endsWith: incomingTutorIdLower } },
          { tutorTid: incomingTutorIdLower },
        ],
      },
      select: { id: true },
    });

    if (!resolvedTutor) {
      throw new NotFoundException('Tutor not found');
    }

    const resolvedTutorId = resolvedTutor.id;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get latest activity anchors (all-time for lastActive, 30 days for frequency)
    const [lastBooking, lastSlot, tutorMeta] = await Promise.all([
      this.prisma.booking.findFirst({
        where: {
          tutorId: resolvedTutorId,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.availabilitySlot.findFirst({
        where: {
          tutorId: resolvedTutorId,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.tutor.findUnique({
        where: { id: resolvedTutorId },
        select: {
          lastActiveDate: true,
          lastAvailabilityUpdate: true,
          updatedAt: true,
          user: {
            select: {
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    const lastActiveCandidates = [
      lastBooking?.createdAt ?? null,
      lastSlot?.createdAt ?? null,
      tutorMeta?.lastActiveDate ?? null,
      tutorMeta?.lastAvailabilityUpdate ?? null,
      tutorMeta?.updatedAt ?? null,
      tutorMeta?.user?.updatedAt ?? null,
    ].filter((value): value is Date => value instanceof Date);

    const lastActive = lastActiveCandidates.length
      ? lastActiveCandidates.reduce(
          (latest, current) => (current.getTime() > latest.getTime() ? current : latest),
          lastActiveCandidates[0],
        )
      : null;
    
    // Calculate activity frequency (days active in last 30 days)
    const activeDays = new Set<string>();
    
    // Count days from bookings
    const bookings = await this.prisma.booking.findMany({
      where: {
        tutorId: resolvedTutorId,
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
        tutorId: resolvedTutorId,
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
  async listAvailability(tutorId: string, from?: string, to?: string) { // NOSONAR
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
