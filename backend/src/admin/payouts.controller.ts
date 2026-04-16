import { Controller, Get, Post, Patch, Param, Body, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toCsv } from '../common/csv.util';
import { PayoutStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@ApiTags('Admin Payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/payouts')
export class PayoutsController {
  private readonly logger = new Logger(PayoutsController.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private notify: NotificationsService,
  ) {}

  @ApiOperation({ summary: 'List payouts' })
  @Get()
  async list() {
    const payouts = await this.prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tutor: {
          select: {
            id: true,
            userId: true,
            user: { select: { name: true, email: true } },
            kycApplications: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: {
                bankAccountHolder: true,
                bankName: true,
                accountNumber: true,
                ifsc: true,
                upiId: true,
              },
            },
          },
        },
      },
    });

    // Generate presigned URLs for slips
    return Promise.all(
      payouts.map(async (p) => {
        if (p.slipUrl) {
          try {
            const signedSlipUrl = await this.s3.getPresignedUrl(p.slipUrl, 3600);
            return { ...p, slipUrl: signedSlipUrl };
          } catch {
            return p;
          }
        }
        return p;
      }),
    );
  }

  @ApiOperation({ summary: 'Create payout (manual admin action)' })
  @Post()
  async create(@Body() dto: { tutorId: string; amount: number; reference?: string; transactionId?: string; details?: string; paymentMethod?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: {
          tutorId: dto.tutorId,
          amount: new Decimal(dto.amount),
          status: PayoutStatus.PENDING,
          reference: dto.reference ?? null,
          transactionId: dto.transactionId ?? null,
          details: dto.details ?? null,
          paymentMethod: dto.paymentMethod ?? null,
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
          note: `Payout ${payout.id}${dto.reference ? ` (${dto.reference})` : ''}${dto.transactionId ? ` [TxnID: ${dto.transactionId}]` : ''}`,
        },
      });
      return payout;
    });
  }

  @ApiOperation({ summary: 'Upload payment slip for a payout (admin record keeping)' })
  @Post(':id/slip')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Only JPEG, PNG, WebP, or PDF files are allowed'), false);
      }
    },
  }))
  async uploadSlip(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw new BadRequestException('Payout not found');

    const slipUrl = await this.s3.uploadFile(file.buffer, file.originalname, `payouts/${id}`);
    return this.prisma.payout.update({
      where: { id },
      data: { slipUrl },
    });
  }

  @ApiOperation({ summary: 'Get presigned URL for payout slip' })
  @Get(':id/slip')
  async viewSlip(@Param('id') id: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id }, select: { slipUrl: true } });
    if (!payout?.slipUrl) throw new BadRequestException('No slip uploaded for this payout');
    const signedUrl = await this.s3.getPresignedUrl(payout.slipUrl, 3600);
    return { url: signedUrl };
  }

  @ApiOperation({ summary: 'Get auto-generated receipt for a payout (admin view)' })
  @Get(':id/receipt')
  async getReceipt(@Param('id') id: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      select: {
        id: true,
        amount: true,
        status: true,
        reference: true,
        transactionId: true,
        paymentMethod: true,
        details: true,
        slipUrl: true,
        createdAt: true,
        paidAt: true,
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            user: { select: { name: true, email: true } },
            kycApplications: {
              orderBy: { updatedAt: 'desc' as const },
              take: 1,
              select: {
                bankAccountHolder: true,
                bankName: true,
                accountNumber: true,
                ifsc: true,
                upiId: true,
              },
            },
          },
        },
      },
    });
    if (!payout) throw new NotFoundException('Payout not found');

    let signedSlipUrl: string | null = null;
    if (payout.slipUrl) {
      try {
        signedSlipUrl = await this.s3.getPresignedUrl(payout.slipUrl, 3600);
      } catch {
        signedSlipUrl = payout.slipUrl;
      }
    }

    const bankInfo = payout.tutor?.kycApplications?.[0] || null;

    return {
      receiptId: `TUN-PAY-${payout.id.slice(-8).toUpperCase()}`,
      payoutId: payout.id,
      tutorName: payout.tutor?.user?.name || 'Unknown',
      tutorEmail: payout.tutor?.user?.email || '',
      amount: Number(payout.amount),
      status: payout.status,
      transactionId: payout.transactionId,
      paymentMethod: payout.paymentMethod,
      reference: payout.reference,
      details: payout.details,
      slipUrl: signedSlipUrl,
      bankInfo,
      createdAt: payout.createdAt.toISOString(),
      paidAt: payout.paidAt?.toISOString() || null,
      companyName: 'Tunect Private Limited',
      generatedAt: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: 'Mark payout as PAID or CANCELED' })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: { status: 'PAID' | 'CANCELED'; transactionId?: string; paidDate?: string; details?: string; paymentMethod?: string }) {
    const data: any = {};
    if (dto.status === 'PAID') {
      data.status = PayoutStatus.PAID;
      data.paidAt = dto.paidDate ? new Date(dto.paidDate) : new Date();
    } else {
      data.status = PayoutStatus.CANCELED;
    }
    if (dto.transactionId) data.transactionId = dto.transactionId;
    if (dto.details) data.details = dto.details;
    if (dto.paymentMethod) data.paymentMethod = dto.paymentMethod;
    const updated = await this.prisma.payout.update({
      where: { id },
      data,
      include: {
        tutor: { select: { user: { select: { email: true, name: true } } } },
      },
    });

    if (dto.status === 'PAID' && updated.tutor?.user?.email) {
      const receiptId = `TUN-PAY-${id.slice(-8).toUpperCase()}`;
      this.notify.sendPayoutProcessedEmail({
        to: updated.tutor.user.email,
        tutorName: updated.tutor.user.name ?? undefined,
        amount: Number(updated.amount),
        paymentMethod: updated.paymentMethod ?? undefined,
        referenceId: updated.reference ?? undefined,
        transactionId: updated.transactionId ?? undefined,
        receiptId,
        paidAt: (updated.paidAt ?? new Date()).toISOString(),
      }).then((sent) => {
        if (!sent) this.logger.error(`Payout PAID email NOT sent to ${updated.tutor!.user!.email} — check Graph/SMTP config`);
        else this.logger.log(`Payout PAID email sent → ${updated.tutor!.user!.email}`);
      }).catch((e) => this.logger.error(`Payout PAID email threw for ${updated.tutor!.user!.email}: ${e?.message}`));
    }

    if (dto.status === 'CANCELED' && updated.tutor?.user?.email) {
      this.notify.sendPayoutFailedEmail({
        to: updated.tutor.user.email,
        tutorName: updated.tutor.user.name ?? undefined,
        amount: Number(updated.amount),
        referenceId: updated.reference ?? undefined,
        reason: updated.details ?? 'Payout was cancelled by admin.',
      }).catch((e) => this.logger.error(`Payout CANCELED email threw for ${updated.tutor!.user!.email}: ${e?.message}`));
    }

    return updated;
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
