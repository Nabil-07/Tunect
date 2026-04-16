import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
  ) {}

  /** Student creates a review for a completed (or finished) booking they attended. */
  async create(studentUserId: string, dto: CreateReviewDto) {
    // Load booking with relations
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        student: { select: { id: true, userId: true } },
        tutorId: true,
        endTime: true,
        status: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Ownership check
    if (booking.student.userId !== studentUserId) {
      throw new ForbiddenException('You can only review your own bookings.');
    }

    // Allow review if status is COMPLETED or the session has ended in the past
    const finished =
      booking.status === BookingStatus.COMPLETED ||
      (!!booking.endTime && booking.endTime < new Date());

    if (!finished) {
      throw new BadRequestException('You can review only after the session ends.');
    }

    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    // Enforce one review per tutor for this student
    const existing = await this.prisma.review.findFirst({
      where: { studentId: student.id, tutorId: booking.tutorId },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('You have already reviewed this tutor. You can edit or delete your review.');
    }

    // Create the review (unique bookingId already enforced in schema)
    try {
      const review = await this.prisma.review.create({
        data: {
          bookingId: booking.id,
          studentId: student.id,
          tutorId: booking.tutorId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });

      // Notify tutor of their new review (fire-and-forget)
      const tutorUser = await this.prisma.tutor.findUnique({
        where: { id: booking.tutorId },
        select: { user: { select: { email: true, name: true } } },
      });
      if (tutorUser?.user?.email) {
        const studentUser = await this.prisma.user.findUnique({
          where: { id: studentUserId },
          select: { name: true },
        });
        this.notify.sendReviewReceivedEmail({
          to: tutorUser.user.email,
          tutorName: tutorUser.user.name ?? undefined,
          studentName: studentUser?.name ?? undefined,
          rating: dto.rating,
          comment: dto.comment,
          sessionDate: booking.endTime?.toISOString(),
        }).catch((e) => this.logger.warn(`Review notification email failed for ${tutorUser.user.email}: ${e?.message}`));
      }

      return review;
    } catch (e: any) {
      // P2002 unique violation (one review per booking)
      if (e?.code === 'P2002') throw new BadRequestException('You have already reviewed this session.');
      throw e;
    }
  }

  /** Student updates own review. */
  async updateMine(studentUserId: string, reviewId: string, dto: { rating?: number; comment?: string }) {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.studentId !== student.id) throw new ForbiddenException('Not your review.');

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        rating: dto.rating ?? review.rating,
        comment: dto.comment ?? review.comment,
      },
    });
  }

  /** Student’s own reviews (paginated). */
  async listMine(studentUserId: string, page = 1, pageSize = 20) {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const skip = (Math.max(page, 1) - 1) * Math.max(pageSize, 1);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { studentId: student.id },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          tutorId: true,
          bookingId: true,
          tutor: { select: { id: true, user: { select: { name: true, email: true } } } },
        },
      }),
      this.prisma.review.count({ where: { studentId: student.id } }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Public: reviews for a tutor with stats. */
  async listForTutor(tutorId: string, q: QueryReviewsDto) {
    // Resolve tutor ID using flexible lookup (for slug-based lookups)
    // First try exact match by full ID
    let tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true },
    });
    
    // Then try by tutorTid
    tutor ??= await this.prisma.tutor.findUnique({
      where: { tutorTid: tutorId },
      select: { id: true },
    });
    
    // Finally try finding by ID ending with the provided string (for slug-based lookups)
    tutor ??= await this.prisma.tutor.findFirst({
      where: { id: { endsWith: tutorId } },
      select: { id: true },
    });
    
    // Use resolved tutor ID (or original if not found - will return empty results)
    const resolvedTutorId = tutor?.id || tutorId;
    
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.max(q.pageSize ?? 20, 1);
    const skip = (page - 1) * pageSize;

    const [items, total, agg] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { tutorId: resolvedTutorId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          bookingId: true,
          student: { select: { id: true, user: { select: { email: true } } } },
        },
      }),
      this.prisma.review.count({ where: { tutorId: resolvedTutorId } }),
      this.prisma.review.aggregate({
        where: { tutorId: resolvedTutorId },
        _avg: { rating: true },
      }),
    ]);

    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      stats: { avgRating: agg._avg.rating ?? 0 },
    };
  }

  /** Public: latest reviews with comments for homepage. */
  async listFeatured(limit = 6) {
    const take = Math.max(1, Math.min(limit, 12));
    const items = await this.prisma.review.findMany({
      where: {
        comment: { not: null, notIn: [''] },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        studentId: true,
        tutorId: true,
      },
    });

    const studentIds = Array.from(new Set(items.map((r) => r.studentId)));
    const tutorIds = Array.from(new Set(items.map((r) => r.tutorId)));

    const [students, tutors] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, user: { select: { name: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.tutor.findMany({
        where: { id: { in: tutorIds } },
        select: { id: true, subjects: true, user: { select: { name: true, email: true, avatarUrl: true } } },
      }),
    ]);

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const tutorMap = new Map(tutors.map((t) => [t.id, t]));

    return items.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      studentName:
        studentMap.get(r.studentId)?.user?.name ??
        studentMap.get(r.studentId)?.user?.email?.split('@')[0] ??
        'Student',
      studentAvatar: studentMap.get(r.studentId)?.user?.avatarUrl ?? null,
      tutorName:
        tutorMap.get(r.tutorId)?.user?.name ??
        tutorMap.get(r.tutorId)?.user?.email?.split('@')[0] ??
        'Tutor',
      tutorSubject: tutorMap.get(r.tutorId)?.subjects?.[0] ?? '',
    }));
  }

  /** Student deletes own review. */
  async removeMine(studentUserId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true },
    });
    if (!student || review.studentId !== student.id) throw new ForbiddenException('Not your review.');

    await this.prisma.review.delete({ where: { id: reviewId } });
    return { ok: true };
  }

  /** Admin deletes any review. */
  async removeAdmin(reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id: reviewId } });
    return { ok: true };
  }
}
