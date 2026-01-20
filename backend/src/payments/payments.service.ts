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
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundDto } from './dto/refund.dto';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import { PaymentStatus, PaymentProvider, TokenReason, BookingStatus, Prisma } from '@prisma/client';
import { Role } from '../auth/role.enum';

const PURCHASE_MIN_TOKENS = Number(process.env.PURCHASE_MIN_TOKENS ?? 5);
const RECEIPT_MAX = 40;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razor?: Razorpay;

  constructor(
    private prisma: PrismaService,
    private ledger: TokenLedgerService,
  ) {
    // Try both env var naming conventions
    const key_id = process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET || process.env.RZP_KEY_SECRET;
    
    this.logger.log(`Razorpay initialization check - Key ID: ${key_id ? 'present' : 'missing'}, Key Secret: ${key_secret ? 'present' : 'missing'}`);
    
    if (key_id && key_secret) {
      try {
        this.razor = new Razorpay({ key_id, key_secret });
        this.logger.log(`Razorpay initialized successfully with key_id: ${key_id.substring(0, 8)}...`);
      } catch (e) {
        this.logger.error('Failed to initialize Razorpay', e);
        this.razor = undefined;
      }
    } else {
      this.logger.warn('Razorpay keys not found. Payment features will be disabled.');
      this.logger.warn(`Checked env vars: RAZORPAY_KEY_ID=${!!process.env.RAZORPAY_KEY_ID}, RZP_KEY_ID=${!!process.env.RZP_KEY_ID}, RAZORPAY_KEY_SECRET=${!!process.env.RAZORPAY_KEY_SECRET}, RZP_KEY_SECRET=${!!process.env.RZP_KEY_SECRET}`);
      this.razor = undefined;
    }
  }

  private requireRazor() {
    if (!this.razor) {
      const keyId = process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RZP_KEY_SECRET;
      const hasKeyId = !!keyId;
      const hasKeySecret = !!keySecret;
      
      this.logger.error('Razorpay not initialized', {
        hasKeyId,
        hasKeySecret,
        keyIdPrefix: keyId ? keyId.substring(0, 8) + '...' : 'missing',
      });
      
      throw new BadRequestException(
        hasKeyId && hasKeySecret
          ? 'Razorpay authentication failed. Please verify your API keys are correct and match (test keys with test mode, production keys with production mode).'
          : 'Razorpay keys are missing on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (or RZP_KEY_ID and RZP_KEY_SECRET).',
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

  // Ensure a paid booking placeholder exists (PENDING_SLOT) when tutorId is known.
  private async ensurePendingSlotBooking(paymentId: string, studentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return null;

    const meta = (payment.metadata as any) || {};
    const tutorId: string | undefined = meta?.tutorId;
    const tokens = Number(meta?.tokens ?? 0);
    const notes = meta?.notes ?? null;

    if (!tutorId) return null;

    return this.prisma.$transaction(async (tx) => {
      const refreshed = await tx.payment.findUnique({ where: { id: paymentId }, select: { metadata: true } });
      const refreshedMeta = (refreshed?.metadata as any) || {};
      if (refreshedMeta.bookingId) {
        return tx.booking.findUnique({ where: { id: refreshedMeta.bookingId } });
      }

      const booking = await tx.booking.create({
        data: {
          tutorId,
          studentId,
          isDemo: false,
          status: BookingStatus.PENDING_SLOT,
          tokensCharged: new Prisma.Decimal(Math.max(0, tokens)),
          notes,
        },
      });

      if (tokens > 0) {
        // Reserve the purchased tokens against this booking so they cannot be double-spent.
        const hold = Math.floor(tokens);
        await tx.student.update({
          where: { id: studentId },
          data: { tokens: { decrement: hold } },
        });

        await tx.tokenLedger.create({
          data: {
            studentId,
            tutorId,
            bookingId: booking.id,
            paymentId,
            delta: new Prisma.Decimal(-hold),
            reason: TokenReason.BOOKING,
          },
        });
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { metadata: { ...meta, bookingId: booking.id } },
      });

      return booking;
    });
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

    // Always calculate and store in INR (Razorpay requirement)
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
        currency: 'INR', // Always INR for Razorpay
        receipt, // ✅ <= 40 chars now
      });
    } catch (e: any) {
      // Log full error details for debugging
      const errorDetails = {
        error: e,
        errorMessage: e?.message,
        errorDescription: e?.error?.description,
        errorCode: e?.error?.code,
        statusCode: e?.statusCode,
        statusMessage: e?.statusMessage,
        keyId: (process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID || 'NOT_SET').substring(0, 12) + '...',
        hasKeySecret: !!(process.env.RAZORPAY_KEY_SECRET || process.env.RZP_KEY_SECRET),
        amountInMinor,
        receipt,
      };
      
      this.logger.error('Razorpay order create failed', errorDetails);
      
      // Extract detailed error message
      let msg = 'Could not create Razorpay order';
      
      // Razorpay API errors typically have this structure:
      // { error: { code: 'BAD_REQUEST_ERROR', description: '...', source: '...', step: '...', reason: '...' } }
      // 401 errors indicate authentication failure
      if (e?.statusCode === 401 || (e?.error?.code === 'BAD_REQUEST_ERROR' && e?.error?.description?.toLowerCase().includes('authentication'))) {
        msg = 'Authentication failed. Please verify your Razorpay API keys are correct and match each other. Ensure: 1) Key ID and Key Secret are from the same Razorpay account, 2) Test keys (rzp_test_*) are used for test mode, 3) Production keys (rzp_live_*) are used for production mode, 4) Keys are not expired or revoked.';
      } else if (e?.error?.description) {
        msg = e.error.description;
      } else if (e?.error?.code === 'BAD_REQUEST_ERROR' || e?.statusCode === 400) {
        msg = e?.error?.description || 'Invalid request to Razorpay. Please check your payment configuration.';
      } else if (e?.message) {
        msg = e.message;
      }
      
      throw new BadRequestException(msg);
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amountInMinor,
        currency: 'INR', // Always store INR
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
          displayCurrency: dto.displayCurrency ?? 'INR', // Store user's display preference
        } as any,
      },
    });

    return {
      orderId: order.id,
      amount: amountInMinor,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID || '',
      paymentId: payment.id,
    };
  }

  // ===== Verify and finalize (idempotent) =====
  async verifyAndFinalize(userId: string, dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: dto.razorpay_order_id, userId },
    });
    if (!payment) throw new BadRequestException('Payment not found for user');

    const secret = (process.env.RAZORPAY_KEY_SECRET || process.env.RZP_KEY_SECRET) as string;
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
      const tutorId = (payment.metadata as any)?.tutorId;
      const pricePerToken = (payment.metadata as any)?.hourlyRateInInr || 0;

      await this.ledger.credit(
        studentId,
        Number(payment.tokensPurchased),
        TokenReason.ADMIN_ADJUSTMENT,
        payment.id,
      );

      // Lock in the price per token for this student-tutor combination
      if (tutorId && pricePerToken > 0) {
        await this.prisma.tutorTokenBalance.upsert({
          where: {
            studentId_tutorId: {
              studentId,
              tutorId,
            },
          },
          update: {
            balance: { increment: Number(payment.tokensPurchased) },
          },
          create: {
            studentId,
            tutorId,
            balance: Number(payment.tokensPurchased),
            pricePerToken: new Prisma.Decimal(pricePerToken),
          },
        });
      }

      await this.ensurePendingSlotBooking(payment.id, studentId);
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

        await this.ensurePendingSlotBooking(payment.id, studentId);
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

  async getReceiptForUser(id: string, requesterUserId: string, requesterRole: Role) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    if (!payment) throw new NotFoundException('Payment not found');

    const isOwner = payment.userId === requesterUserId;
    const isAdmin = requesterRole === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this payment receipt');
    }

    // Calculate totals
    const totalRefunded = payment.refunds.reduce(
      (sum, r) => sum + Number(r.amountInMinor),
      0,
    );
    const amountPaid = Number(payment.amountInMinor);
    const netAmount = amountPaid - totalRefunded;

    // Format receipt data
    return {
      id: payment.id,
      date: payment.createdAt,
      status: payment.status,
      customer: {
        name: payment.user.name,
        email: payment.user.email,
      },
      payment: {
        amountPaid: amountPaid / 100, // Convert to INR
        currency: payment.currency,
        tokensPurchased: Number(payment.tokensPurchased),
        provider: payment.provider,
        providerOrderId: payment.providerOrderId,
        providerPaymentId: payment.providerPaymentId,
      },
      refunds: payment.refunds.map(r => ({
        id: r.id,
        amount: Number(r.amountInMinor) / 100,
        reason: r.reason,
        date: r.createdAt,
        providerRefundId: r.providerRefundId,
      })),
      summary: {
        totalPaid: amountPaid / 100,
        totalRefunded: totalRefunded / 100,
        netAmount: netAmount / 100,
      },
      metadata: payment.metadata,
    };
  }

  async generateReceiptPDF(receiptData: any, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      
      // Pipe PDF to response
      doc.pipe(res);

      // Header
      doc.fontSize(20).text('PAYMENT RECEIPT', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Receipt ID: ${receiptData.id}`, { align: 'right' });
      doc.text(`Date: ${new Date(receiptData.date).toLocaleDateString()}`, { align: 'right' });
      doc.moveDown();

      // Customer Information
      doc.fontSize(14).text('Customer Information', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Name: ${receiptData.customer.name || 'N/A'}`);
      doc.text(`Email: ${receiptData.customer.email}`);
      doc.moveDown();

      // Payment Details
      doc.fontSize(14).text('Payment Details', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Status: ${receiptData.status}`);
      doc.text(`Amount Paid: ₹${receiptData.payment.amountPaid.toFixed(2)}`);
      doc.text(`Tokens Purchased: ${receiptData.payment.tokensPurchased}`);
      doc.text(`Payment Method: ${receiptData.payment.provider}`);
      doc.text(`Order ID: ${receiptData.payment.providerOrderId || 'N/A'}`);
      doc.text(`Payment ID: ${receiptData.payment.providerPaymentId || 'N/A'}`);
      doc.moveDown();

      // Refunds (if any)
      if (receiptData.refunds && receiptData.refunds.length > 0) {
        doc.fontSize(14).text('Refunds', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10);
        receiptData.refunds.forEach((refund: any, index: number) => {
          doc.text(`Refund ${index + 1}:`);
          doc.text(`  Amount: ₹${refund.amount.toFixed(2)}`);
          doc.text(`  Reason: ${refund.reason || 'N/A'}`);
          doc.text(`  Date: ${new Date(refund.date).toLocaleDateString()}`);
          doc.text(`  Refund ID: ${refund.providerRefundId || 'N/A'}`);
          doc.moveDown(0.5);
        });
        doc.moveDown();
      }

      // Summary
      doc.fontSize(14).text('Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Total Paid: ₹${receiptData.summary.totalPaid.toFixed(2)}`);
      doc.text(`Total Refunded: ₹${receiptData.summary.totalRefunded.toFixed(2)}`);
      doc.fontSize(12).text(`Net Amount: ₹${receiptData.summary.netAmount.toFixed(2)}`);
      doc.moveDown();

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).text('Thank you for your business!', { align: 'center' });
      doc.text('This is a computer-generated receipt.', { align: 'center' });

      // Finalize PDF
      doc.end();

      doc.on('finish', () => resolve());
      doc.on('error', (error) => reject(error));
    });
  }
}
