// src/tutors/tutor-wallet.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutStatus } from '@prisma/client';

@Injectable()
export class TutorWalletService {
  constructor(private prisma: PrismaService) {}

  private async getTutorIdForUser(userId: string): Promise<string> {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) throw new NotFoundException('Tutor profile not found for user.');
    return tutor.id;
  }

  /** Returns (and auto-creates) the tutor wallet for the current user */
  async getMyWallet(userId: string) {
    const tutorId = await this.getTutorIdForUser(userId);
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
