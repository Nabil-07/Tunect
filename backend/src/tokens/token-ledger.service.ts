import { Injectable } from '@nestjs/common';
import { Prisma, TokenReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokenLedgerService {
  constructor(private prisma: PrismaService) {}

  // credit tokens to a Student (global—no tutorId)
  async credit(studentId: string, tokens: number, reason: TokenReason | 'ADMIN_ADJUSTMENT', paymentId?: string) {
    // Decimal as string to satisfy Prisma Decimal
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenLedger.create({
        data: {
          studentId,
          delta: new Prisma.Decimal(tokens.toString()),
          reason: (reason as TokenReason) ?? 'ADMIN_ADJUSTMENT',
          paymentId: paymentId ?? null,
        },
      });
      // Optional legacy global balance
      await tx.student.update({
        where: { id: studentId },
        data: { tokens: { increment: Math.floor(tokens) } },
      });
    });
  }

  // debit tokens from a Student (e.g., refund)
  async debit(studentId: string, tokens: number, reason: TokenReason, paymentId?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenLedger.create({
        data: {
          studentId,
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
