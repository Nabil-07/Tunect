import { Injectable } from '@nestjs/common';
import { Prisma, TokenReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokenLedgerService {
  constructor(private prisma: PrismaService) {}

  // credit tokens to a Student (optionally tying to a payment/booking)
  async credit(
    studentId: string,
    tokens: number,
    reason: TokenReason | 'ADMIN_ADJUSTMENT',
    paymentId?: string,
    bookingId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenLedger.create({
        data: {
          studentId,
          bookingId: bookingId ?? null,
          delta: new Prisma.Decimal(tokens.toString()),
          reason: (reason as TokenReason) ?? 'ADMIN_ADJUSTMENT',
          paymentId: paymentId ?? null,
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: { tokens: { increment: Math.floor(tokens) } },
      });
    });
  }

  // debit tokens from a Student (e.g., refund or booking hold)
  async debit(
    studentId: string,
    tokens: number,
    reason: TokenReason,
    paymentId?: string,
    bookingId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenLedger.create({
        data: {
          studentId,
          bookingId: bookingId ?? null,
          delta: new Prisma.Decimal(`-${tokens}`),
          reason,
          paymentId: paymentId ?? null,
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: { tokens: { decrement: Math.floor(tokens) } },
      });
    });
  }
}
