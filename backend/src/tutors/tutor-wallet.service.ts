// src/tutors/tutor-wallet.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutStatus } from '@prisma/client';

@Injectable()
export class TutorWalletService {
  constructor(private prisma: PrismaService) {}

  private getBookingHours(startTime?: Date | null, endTime?: Date | null, fallbackTokens?: number | null): number {
    if (startTime && endTime) {
      const diffMs = endTime.getTime() - startTime.getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) return diffMs / 3_600_000;
    }
    const fallback = Number(fallbackTokens ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  private platformFeePercent(hourlyRate?: number | null) {
    const rate = Number(hourlyRate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 20; // Default fallback
    // Commission rates: 0-399=25%, 400-699=22%, 700+=18%
    if (rate < 400) return 25;
    if (rate < 700) return 22;
    return 18;
  }

  private async ensureCompletedBookingsCredited(tutorId: string) {
    const now = new Date();
    const bookings = await this.prisma.booking.findMany({
      where: {
        tutorId,
        endTime: { not: null, lt: now },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
      },
      select: {
        id: true,
        status: true,
        isDemo: true,
        tokensCharged: true,
        startTime: true,
        endTime: true,
        tutor: { select: { hourlyRate: true } },
      },
    });

    if (!bookings.length) return;

    const bookingIds = bookings.map((b) => b.id);
    const existingLedger = await this.prisma.tutorWalletLedger.findMany({
      where: {
        bookingId: { in: bookingIds },
        reason: 'BOOKING_EARNED',
      },
      select: { bookingId: true },
    });
    const credited = new Set(existingLedger.map((e) => e.bookingId).filter(Boolean));

    for (const booking of bookings) {
      if (credited.has(booking.id)) continue;
      if (booking.isDemo) continue;
      const hours = this.getBookingHours(booking.startTime, booking.endTime, Number(booking.tokensCharged || 0));
      if (!hours) continue;

      // Calculate earnings based on hourly rate and duration
      // tokensCharged represents hours (TOKENS_PER_HOUR = 1)
      const hourlyRate = Number(booking.tutor?.hourlyRate ?? 0);
      const bookingAmount = hours * hourlyRate; // Total amount for the booking
      
      const fee = this.platformFeePercent(hourlyRate);
      const tutorShare = Math.max(0, (bookingAmount * (100 - fee)) / 100);
      if (tutorShare <= 0) continue;

      await this.prisma.$transaction(async (tx) => {
        await tx.tutorWallet.upsert({
          where: { tutorId },
          update: { balance: { increment: tutorShare } },
          create: { tutorId, balance: tutorShare },
          select: { tutorId: true },
        });

        await tx.tutorWalletLedger.create({
          data: {
            tutorId,
            bookingId: booking.id,
            delta: tutorShare,
            reason: 'BOOKING_EARNED',
            note: 'Auto-credited for completed session',
          },
        });

        if (booking.status !== 'COMPLETED') {
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'COMPLETED' },
          });
        }
      });
    }
  }

  private async getTutorIdForUser(userId: string): Promise<string> {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) throw new NotFoundException('Tutor profile not found for user.');
    return tutor.id;
  }

  /** Returns (and auto-creates) the tutor wallet for the current user */
  async getMyWallet(userId: string) {
    const tutorId = await this.getTutorIdForUser(userId);
    await this.ensureCompletedBookingsCredited(tutorId);
    return this.prisma.tutorWallet.upsert({
      where: { tutorId },
      update: {},
      create: { tutorId },
      select: { tutorId: true, balance: true, updatedAt: true },
    });
  }

  /** Ledger entries (newest first), cursor = createdAt ISO */
  async getMyLedger(userId: string, cursor?: string, limit = 50) {
    const tutorId = await this.getTutorIdForUser(userId);
    await this.ensureCompletedBookingsCredited(tutorId);

    const where: any = { tutorId };
    if (cursor) {
      const dt = new Date(cursor);
      if (!isNaN(dt.getTime())) where.createdAt = { lt: dt };
    }

    const rows = await this.prisma.tutorWalletLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        bookingId: true,
        delta: true,
        reason: true,
        note: true,
        createdAt: true,
        booking: {
          select: { id: true, studentId: true, startTime: true, endTime: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor };
  }

  /** Payouts list (newest first), optional status filter */
  async listMyPayouts(
    userId: string,
    status?: PayoutStatus,
    cursor?: string,
    limit = 20,
  ) {
    const tutorId = await this.getTutorIdForUser(userId);

    const where: any = { tutorId };
    if (status) where.status = status;
    if (cursor) {
      const dt = new Date(cursor);
      if (!isNaN(dt.getTime())) where.createdAt = { lt: dt };
    }

    const rows = await this.prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        amount: true,
        status: true,
        reference: true,
        createdAt: true,
        paidAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor };
  }
}
