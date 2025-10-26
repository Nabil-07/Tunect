import { Controller, Get, Post, Patch, Param, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../common/csv.util';
import { PayoutStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@ApiTags('Admin Payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/payouts')
export class PayoutsController {
  constructor(private prisma: PrismaService) {}

  @ApiOperation({ summary: 'List payouts' })
  @Get()
  list() {
    return this.prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tutor: { select: { id: true, userId: true } } },
    });
  }

  @ApiOperation({ summary: 'Create payout (manual admin action)' })
  @Post()
  async create(@Body() dto: { tutorId: string; amount: number; reference?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: {
          tutorId: dto.tutorId,
          amount: new Decimal(dto.amount),
          status: PayoutStatus.PENDING,
          reference: dto.reference ?? null,
        },
      });
      // deduct from wallet immediately for accounting
      await tx.tutorWallet.upsert({
        where: { tutorId: dto.tutorId },
        create: { tutorId: dto.tutorId, balance: new Decimal(0) },
        update: { balance: { decrement: dto.amount } },
      });
      await tx.tutorWalletLedger.create({
        data: {
          tutorId: dto.tutorId,
          bookingId: null,
          delta: new Decimal(-dto.amount),
          reason: 'PAYOUT',
          note: `Payout ${payout.id}${dto.reference ? ` (${dto.reference})` : ''}`,
        },
      });
      return payout;
    });
  }

  @ApiOperation({ summary: 'Mark payout as PAID or CANCELED' })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: { status: 'PAID' | 'CANCELED' }) {
    const data: any =
      dto.status === 'PAID'
        ? { status: PayoutStatus.PAID, paidAt: new Date() }
        : { status: PayoutStatus.CANCELED };
    return this.prisma.payout.update({ where: { id }, data });
  }

  @ApiOperation({ summary: 'Export payouts (CSV)' })
  @Get('export')
  async export(@Res() res: Response) {
    const rows = await this.prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, tutorId: true, amount: true, status: true, reference: true, createdAt: true, paidAt: true },
    });
    const csv = toCsv(
      rows.map(r => ({
        ...r,
        amount: r.amount.toString(),
        createdAt: r.createdAt.toISOString(),
        paidAt: r.paidAt ? r.paidAt.toISOString() : '',
      })),
    );
    res.header('Content-Type', 'text/csv');
    res.attachment('payouts.csv');
    res.send(csv);
  }
}
