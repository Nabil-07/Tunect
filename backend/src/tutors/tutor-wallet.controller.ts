// src/tutors/tutor-wallet.controller.ts
import { Controller, Get, Param, Query, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { PayoutStatus } from '@prisma/client';
import { TutorWalletService } from './tutor-wallet.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Tutor Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tutors/me')
export class TutorWalletController {
  constructor(
    private readonly wallet: TutorWalletService,
    private readonly prisma: PrismaService,
  ) {}

  @ApiOperation({ summary: 'Get my tutor wallet balance' })
  @Roles(Role.TUTOR, Role.ADMIN)
  @Get('wallet')
  getMyWallet(@CurrentUser('id') userId: string) {
    return this.wallet.getMyWallet(userId);
  }

  @ApiOperation({ summary: 'Get my tutor wallet ledger (paginated, newest first)' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'createdAt ISO; returns entries before this timestamp',
    example: '2025-08-12T10:00:00.000Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (default 50, max 100)',
    example: 50,
  })
  @Roles(Role.TUTOR, Role.ADMIN)
  @Get('ledger')
  getMyLedger(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(100, Math.max(Number(limit ?? 50), 1));
    return this.wallet.getMyLedger(userId, cursor, n);
  }

  @ApiOperation({ summary: 'List my payouts' })
  @ApiQuery({ name: 'status', required: false, enum: PayoutStatus })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'createdAt ISO; returns payouts before this timestamp',
    example: '2025-08-12T10:00:00.000Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (default 20, max 50)',
    example: 20,
  })
  @Roles(Role.TUTOR, Role.ADMIN)
  @Get('payouts')
  getMyPayouts(
    @CurrentUser('id') userId: string,
    @Query('status') status?: PayoutStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(50, Math.max(Number(limit ?? 20), 1));
    return this.wallet.listMyPayouts(userId, status, cursor, n);
  }

  @ApiOperation({ summary: 'Get payout receipt (JSON data for front-end rendering)' })
  @Roles(Role.TUTOR, Role.ADMIN)
  @Get('payouts/:payoutId/receipt')
  async getPayoutReceipt(
    @CurrentUser('id') userId: string,
    @Param('payoutId') payoutId: string,
  ) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');

    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, tutorId: tutor.id },
      select: {
        id: true,
        amount: true,
        status: true,
        reference: true,
        transactionId: true,
        paymentMethod: true,
        details: true,
        createdAt: true,
        paidAt: true,
      },
    });
    if (!payout) throw new NotFoundException('Payout not found');

    return {
      receiptId: `TUN-PAY-${payout.id.slice(-8).toUpperCase()}`,
      tutorName: tutor.user.name || tutor.user.email,
      tutorEmail: tutor.user.email,
      amount: Number(payout.amount),
      status: payout.status,
      transactionId: payout.transactionId,
      paymentMethod: payout.paymentMethod,
      reference: payout.reference,
      createdAt: payout.createdAt.toISOString(),
      paidAt: payout.paidAt?.toISOString() || null,
      companyName: 'Tunect Private Limited',
      generatedAt: new Date().toISOString(),
    };
  }
}
