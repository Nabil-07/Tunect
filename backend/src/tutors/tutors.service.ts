import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TutorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TrendingTutorDto } from './dto/trending-tutor.dto';

export type TutorPublic = {
  id: string;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  subjects?: string[] | null;
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

  // ---------- LIST ----------
  async list(params?: {
    page?: number;
    pageSize?: number;
    subject?: string;
    sortBy?: 'updatedAt' | 'rating' | 'hourlyRate';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, Number(params?.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize ?? 8)));
    const skip = (page - 1) * pageSize;

    // ✅ Only tutors with APPROVED status
    const where: any = { status: TutorStatus.APPROVED };

    if (params?.subject && params.subject.trim()) {
      const s = params.subject.trim();
      where.OR = [
        { subjects: { has: s } },
        { subjects: { has: s.toUpperCase() } },
        { subjects: { has: s.toLowerCase() } },
      ];
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
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    if (byId) return normalizeTutor(byId);

    const byTid = await this.prisma.tutor.findUnique({
      where: { tutorTid: idOrTid },
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    if (byTid) return normalizeTutor(byTid);

    throw new NotFoundException('Tutor not found');
  }

  // ---------- TRENDING ----------
  async getTrending(limit = 8): Promise<TrendingTutorDto[]> {
    const rows = await this.prisma.tutor.findMany({
      where: { isTrending: true, status: TutorStatus.APPROVED }, // ✅ only approved
      take: Math.min(Math.max(Number(limit) || 8, 1), 24),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        subjects: true,
        hourlyRate: true,
        country: true,
        reviews: { select: { rating: true } },
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });

    return rows.map<TrendingTutorDto>((t) => {
      const avg =
        t.reviews.length > 0
          ? t.reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / t.reviews.length
          : 4.7;

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
    const sessions = await this.prisma.session.findMany({
      where: { tutorId },
      include: {
        tutor: { select: { subjects: true } },
        student: {
          select: {
            id: true,
            user: { select: { name: true, email: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    const now = new Date();

    return sessions.map((s) => {
      const studentName =
        s.student?.user?.name ||
        (s.student?.user?.email
          ? s.student.user.email.split('@')[0].replace(/\./g, ' ').replace(/^\w/, (c) =>
              c.toUpperCase(),
            )
          : 'Student');

    const subject =
      Array.isArray(s.tutor?.subjects) && s.tutor.subjects.length
        ? s.tutor.subjects[0]
        : 'Session';

      const status: 'UPCOMING' | 'COMPLETED' =
        new Date(s.endTime) > now ? 'UPCOMING' : 'COMPLETED';

      return {
        id: s.id,
        studentName,
        subject,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        status,
      };
    });
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

    if (Array.isArray(body?.subjects)) {
      updatesTutor.subjects = body.subjects
        .map((s: any) => String(s).trim())
        .filter(Boolean);
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
