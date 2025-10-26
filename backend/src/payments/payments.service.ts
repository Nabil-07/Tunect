// src/payments/payments.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundDto } from './dto/refund.dto';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import { PaymentStatus, PaymentProvider, TokenReason } from '@prisma/client';
import { Role } from '../auth/role.enum';

const PURCHASE_MIN_TOKENS = Number(process.env.PURCHASE_MIN_TOKENS ?? 10);
const RECEIPT_MAX = 40;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razor?: Razorpay;

  constructor(
    private prisma: PrismaService,
    private ledger: TokenLedgerService,
  ) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (key_id && key_secret) {
      this.razor = new Razorpay({ key_id, key_secret });
    } else {
      this.razor = undefined;
    }
  }

  private requireRazor() {
    if (!this.razor) {
      throw new BadRequestException(
        'Razorpay keys are missing on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }
    return this.razor;
  }

  private toMinor(inr: number) {
    return Math.round(inr * 100);
  }

  private async getStudentIdForUser(userId: string): Promise<string> {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new BadRequestException('Student profile not found for user.');
    return student.id;
  }

  /** Build a Razorpay-safe receipt (<= 40 chars, alnum+_ only). */
  private makeReceipt(userId: string, tutorId: string) {
    const sanitize = (s: string, n: number) =>
      (s || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
    const u = sanitize(userId, 8);
    const t = sanitize(tutorId, 8);
    const ts = Date.now().toString(36); // compact timestamp
    let r = `t_${t}_u_${u}_${ts}`;
    if (r.length > RECEIPT_MAX) r = r.slice(0, RECEIPT_MAX);
    return r;
  }

  // ===== Create Razorpay order: amount = tutor.hourlyRate * tokens (INR) =====
  async createOrder(userId: string, dto: CreateOrderDto) {
    const rp = this.requireRazor();

    if (!dto?.tutorId) throw new BadRequestException('tutorId is required.');
    if (!Number.isInteger(dto.tokens) || dto.tokens < PURCHASE_MIN_TOKENS) {
      throw new BadRequestException(`Minimum purchase is ${PURCHASE_MIN_TOKENS} tokens.`);
    }

    const [studentId, tutor] = await Promise.all([
      this.getStudentIdForUser(userId),
      this.prisma.tutor.findUnique({
        where: { id: dto.tutorId },
        select: { hourlyRate: true, status: true },
      }),
    ]);

    if (!tutor) throw new NotFoundException('Tutor not found.');
    if (tutor.status !== 'APPROVED') throw new BadRequestException('Tutor is not approved.');

    const rateInInr = Number(tutor.hourlyRate ?? 0);
    if (!Number.isFinite(rateInInr) || rateInInr <= 0) {
      throw new BadRequestException('Tutor hourly rate is not configured.');
    }

    const amountInMinor = this.toMinor(rateInInr * dto.tokens);
    if (!Number.isInteger(amountInMinor) || amountInMinor < 100) {
      throw new BadRequestException(
        `Computed amount is invalid (₹${rateInInr} × ${dto.tokens}).`,
      );
    }

    const receipt = this.makeReceipt(userId, dto.tutorId);

    let order;
    try {
      order = await rp.orders.create({
        amount: amountInMinor,
        currency: 'INR',
        receipt, // ✅ <= 40 chars now
      });
    } catch (e: any) {
      this.logger.error('Razorpay order create failed', e);
      const msg = e?.error?.description || e?.message || 'Could not create Razorpay order';
      throw new BadRequestException(msg);
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amountInMinor,
        currency: 'INR',
        tokensPurchased: dto.tokens,
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.RAZORPAY,
        providerOrderId: order.id,
        metadata: {
          orderId: order.id,
          studentId,
          tutorId: dto.tutorId,
          hourlyRateInInr: rateInInr,
          tokens: dto.tokens,
          notes: dto.notes ?? null,
        } as any,
      },
    });

    return {
      orderId: order.id,
      amount: amountInMinor,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID!,
      paymentId: payment.id,
    };
  }

  // ===== Verify and finalize (idempotent) =====
  async verifyAndFinalize(userId: string, dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: dto.razorpay_order_id, userId },
    });
    if (!payment) throw new BadRequestException('Payment not found for user');

    const secret = process.env.RAZORPAY_KEY_SECRET as string;
    if (!secret) throw new BadRequestException('Razorpay secret not configured');

    const computed = crypto
      .createHmac('sha256', secret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');

    if (computed !== dto.razorpay_signature) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: dto.razorpay_payment_id,
          providerSignature: dto.razorpay_signature,
        },
      });
      throw new BadRequestException('Invalid signature');
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId: dto.razorpay_payment_id,
          providerSignature: dto.razorpay_signature,
        },
      });

      const studentId =
        (payment.metadata as any)?.studentId ?? (await this.getStudentIdForUser(payment.userId));

      await this.ledger.credit(
        studentId,
        Number(payment.tokensPurchased),
        TokenReason.ADMIN_ADJUSTMENT,
        payment.id,
      );
    }

    return { ok: true, paymentId: payment.id };
  }

  // ===== Webhook (idempotent) =====
  async handleWebhook(headers: Record<string, any>, rawBody: Buffer) {
    const sig =
      headers['x-razorpay-signature'] ??
      headers['X-Razorpay-Signature'] ??
      headers['X-RAZORPAY-SIGNATURE'];
    if (!sig) throw new BadRequestException('Missing webhook signature');

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET as string;
    if (!secret) throw new BadRequestException('Webhook secret not configured');

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (sig !== expected) throw new BadRequestException('Invalid webhook signature');

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    const type: string = event.event;
    const payload = event.payload;

    if (type === 'payment.captured') {
      const rpPayment = payload?.payment?.entity;
      const orderId: string | undefined = rpPayment?.order_id;
      const providerPaymentId: string | undefined = rpPayment?.id;

      if (!orderId || !providerPaymentId) return { ok: true };

      const payment = await this.prisma.payment.findFirst({ where: { providerOrderId: orderId } });
      if (!payment) return { ok: true };

      if (payment.status !== PaymentStatus.SUCCEEDED) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.SUCCEEDED, providerPaymentId },
        });

        const studentId =
          (payment.metadata as any)?.studentId ?? (await this.getStudentIdForUser(payment.userId));

        await this.ledger.credit(
          studentId,
          Number(payment.tokensPurchased),
          TokenReason.ADMIN_ADJUSTMENT,
          payment.id,
        );
      }
    }

    if (type === 'refund.processed') {
      const rpRefund = payload?.refund?.entity;
      const providerPaymentId: string | undefined = rpRefund?.payment_id;
      const amt: number | undefined = rpRefund?.amount;
      const providerRefundId: string | undefined = rpRefund?.id;

      if (!providerPaymentId || !amt) return { ok: true };

      if (providerRefundId) {
        const existing = await this.prisma.refund.findFirst({
          where: { providerRefundId },
          select: { id: true },
        });
        if (existing) return { ok: true };
      }

      const payment = await this.prisma.payment.findFirst({ where: { providerPaymentId } });
      if (!payment) return { ok: true };

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });

      const full = amt >= payment.amountInMinor;
      const tokensToReverse = full
        ? payment.tokensPurchased
        : Math.floor(payment.tokensPurchased * (amt / payment.amountInMinor));

      if (tokensToReverse > 0) {
        const studentId =
          (payment.metadata as any)?.studentId ?? (await this.getStudentIdForUser(payment.userId));
        await this.ledger.debit(
          studentId,
          Number(tokensToReverse),
          TokenReason.REFUND,
          payment.id,
        );
      }

      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountInMinor: amt,
          providerRefundId: providerRefundId ?? null,
          reason: rpRefund?.notes?.reason ?? null,
        },
      });
    }

    return { ok: true };
  }

  // ===== Manual refund =====
  async refund(dto: RefundDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id: dto.paymentId } });
    if (
      !payment ||
      payment.provider !== PaymentProvider.RAZORPAY ||
      payment.status !== PaymentStatus.SUCCEEDED
    ) {
      throw new BadRequestException('Refund not allowed');
    }
    if (!payment.providerPaymentId) throw new BadRequestException('Missing provider payment id');

    const rp = this.requireRazor();
    const amount = dto.amountInMinor ?? payment.amountInMinor;

    const refund = await rp.payments.refund(payment.providerPaymentId, {
      amount,
      notes: dto.reason ? { reason: dto.reason } : undefined,
      speed: 'optimum',
      receipt: `refund_${payment.id}_${Date.now()}`.slice(0, RECEIPT_MAX),
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
    });

    const full = amount >= payment.amountInMinor;
    const tokensToReverse = full
      ? payment.tokensPurchased
      : Math.floor(payment.tokensPurchased * (amount / payment.amountInMinor));

    if (tokensToReverse > 0) {
      const studentId =
        (payment.metadata as any)?.studentId ?? (await this.getStudentIdForUser(payment.userId));
      await this.ledger.debit(
        studentId,
        Number(tokensToReverse),
        TokenReason.REFUND,
        payment.id,
      );
    }

    await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountInMinor: amount,
        providerRefundId: (refund as any).id,
        reason: dto.reason ?? null,
      },
    });

    return { ok: true, refundId: (refund as any).id };
  }

  // ===== Owner-or-admin read =====
  async getByIdForUser(id: string, requesterUserId: string, requesterRole: Role) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
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
        providerSignature: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        refunds: {
          select: {
            id: true,
            amountInMinor: true,
            providerRefundId: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Payment not found');

    const isOwner = p.userId === requesterUserId;
    const isAdmin = requesterRole === Role.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('You do not have access to this payment');

    return p;
  }
}
