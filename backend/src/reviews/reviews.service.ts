import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

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

    // Create the review (unique bookingId already enforced in schema)
    try {
      const student = await this.prisma.student.findUnique({
        where: { userId: studentUserId },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Student profile not found');

      const review = await this.prisma.review.create({
        data: {
          bookingId: booking.id,
          studentId: student.id,
          tutorId: booking.tutorId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });
      return review;
    } catch (e: any) {
      // P2002 unique violation (one review per booking)
      if (e?.code === 'P2002') throw new BadRequestException('You have already reviewed this session.');
      throw e;
    }
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
        },
      }),
      this.prisma.review.count({ where: { studentId: student.id } }),
    ]);
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Public: reviews for a tutor with stats. */
  async listForTutor(tutorId: string, q: QueryReviewsDto) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.max(q.pageSize ?? 20, 1);
    const skip = (page - 1) * pageSize;

    const [items, total, agg] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { tutorId },
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
      this.prisma.review.count({ where: { tutorId } }),
      this.prisma.review.aggregate({
        where: { tutorId },
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
