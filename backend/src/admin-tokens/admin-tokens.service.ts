import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export enum TokenReason {
  BOOKING = 'BOOKING',
  REFUND = 'REFUND',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

@Injectable()
export class AdminTokensService {
  constructor(private prisma: PrismaService) {}

  async adjust(dto: { studentId: string; delta: number; bookingId?: string; paymentId?: string }) {
    if (dto.delta === 0) throw new BadRequestException('Delta cannot be zero');

    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundException('Student not found');

    // Prevent negative final balance
    const newBalance = student.tokens + dto.delta;
    if (newBalance < 0) throw new BadRequestException('Insufficient tokens for debit');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id: student.id },
        data: { tokens: newBalance },
        select: { id: true, tokens: true },
      });

      const ledger = await tx.tokenLedger.create({
        data: {
          studentId: student.id,
          delta: dto.delta,
          reason: 'ADMIN_ADJUSTMENT',
          bookingId: dto.bookingId,
          paymentId: dto.paymentId,
        },
        select: { id: true, delta: true, reason: true, createdAt: true, bookingId: true, paymentId: true },
      });

      return { balance: updated.tokens, ledger };
    });

    return result;
  }
}
