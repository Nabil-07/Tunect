import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../common/csv.util';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminReportsController {
  constructor(private prisma: PrismaService) {}

  @ApiOperation({ summary: 'Export bookings (CSV)' })
  @Get('bookings/export')
  async exportBookings(@Res() res: Response) {
    const rows = await this.prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        isDemo: true,
        tokensCharged: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        tutorId: true,
        studentId: true,
      },
    });

    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        // Make dates CSV-safe even when null
        startTime: r.startTime ? r.startTime.toISOString() : '',
        endTime: r.endTime ? r.endTime.toISOString() : '',
        createdAt: r.createdAt.toISOString(),
        // Optional: keep amounts consistent as strings
        tokensCharged: r.tokensCharged.toString(),
      })),
    );

    res.header('Content-Type', 'text/csv');
    res.attachment('bookings.csv');
    res.send(csv);
  }

  @ApiOperation({ summary: 'Export payments (CSV)' })
  @Get('payments/export')
  async exportPayments(@Res() res: Response) {
    const rows = await this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        amountInMinor: true,
        currency: true,
        tokensPurchased: true,
        status: true,
        provider: true,
        providerOrderId: true,
        providerPaymentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    );
    res.header('Content-Type', 'text/csv');
    res.attachment('payments.csv');
    res.send(csv);
  }

  @ApiOperation({ summary: 'Export token ledger (CSV)' })
  @Get('token-ledger/export')
  async exportLedger(@Res() res: Response) {
    const rows = await this.prisma.tokenLedger.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        studentId: true,
        tutorId: true,
        delta: true,
        reason: true,
        bookingId: true,
        paymentId: true,
        createdAt: true,
      },
    });
    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        delta: r.delta.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
    );
    res.header('Content-Type', 'text/csv');
    res.attachment('token-ledger.csv');
    res.send(csv);
  }
}
