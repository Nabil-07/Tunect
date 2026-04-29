import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma, TokenReason } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import * as crypto from 'node:crypto';

const TOKENS_PER_HOUR = 1;

@Injectable()
export class PaymentsPublicService {
  private readonly logger = new Logger(PaymentsPublicService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private getRazorpayClient() {
    const keyId = this.config.get('RAZORPAY_KEY_ID');
    const keySecret = this.config.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials not configured');
    }
    return { keyId, keySecret };
  }

  private resolveTutorPricePerToken(hourlyRate: number): number {
    return Math.ceil(hourlyRate / TOKENS_PER_HOUR);
  }

  private async resolveStudentId(userId: string): Promise<string> {
    let student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (student) return student.id;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) throw new NotFoundException(`User not found: ${userId}`);
    if (user.role !== 'STUDENT') {
      throw new BadRequestException(`User ${user.email} is not a student`);
    }

    student = await this.prisma.student.create({
      data: { userId, tokens: 0 },
      select: { id: true },
    });

    return student.id;
  }

  async createOrder(
    studentId: string,
    dto: { tutorId: string; tokens: number; displayCurrency?: string },
  ) {
    const { tutorId, tokens, displayCurrency = 'INR' } = dto;

    // Validate minimum tokens
    if (tokens < 5) {
      throw new BadRequestException('Minimum 5 tokens required');
    }

    // Find tutor
    let tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, hourlyRate: true },
    });

    // Fallback lookup if not found
    tutor ??= await this.prisma.tutor.findFirst({
      where: { id: { endsWith: tutorId } },
      select: { id: true, hourlyRate: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found.');
    }

    const pricePerToken = this.resolveTutorPricePerToken(Number(tutor.hourlyRate || 0));
    const totalPriceINR = pricePerToken * tokens;
    const amountInPaise = totalPriceINR * 100;

    // Create Payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId: studentId,
        provider: 'RAZORPAY',
        currency: 'INR',
        amountInMinor: amountInPaise,
        tokensPurchased: tokens,
        status: 'PENDING',
        metadata: {
          tutorId: tutor.id,
          tokens,
          displayCurrency,
        },
      },
    });

    // Call Razorpay API to create order
    const { keyId, keySecret } = this.getRazorpayClient();
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `payment-${payment.id}`,
          notes: {
            paymentId: payment.id,
            tutorId: tutor.id,
            tokens: String(tokens),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Razorpay API error: ${response.statusText}`);
      }

      const order = await response.json();

      // Update payment with Razorpay order ID
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerOrderId: order.id },
      });

      return {
        orderId: order.id,
        amount: amountInPaise,
        currency: 'INR',
        keyId,
        paymentId: payment.id,
      };
    } catch (e) {
      // Update payment status to FAILED if Razorpay fails
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      // Notify student of the failure (fire-and-forget)
      const studentUser = await this.prisma.user.findUnique({
        where: { id: studentId },
        select: { email: true, name: true },
      }).catch(() => null);
      if (studentUser?.email) {
        this.notifications.sendPaymentFailedEmail({
          to: studentUser.email,
          studentName: studentUser.name ?? undefined,
          amountInMinor: amountInPaise,
          paymentId: payment.id,
          reason: 'Could not initiate payment with provider. Please try again.',
        }).catch((err) => this.logger.warn(`Payment failed email error: ${err?.message}`));
      }

      throw e;
    }
  }

  async verifyPayment(
    userId: string,
    dto: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  ) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = dto;

    // Find payment by Razorpay order ID
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: razorpay_order_id, userId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify signature
    const { keySecret } = this.getRazorpayClient();
    const shasum = crypto.createHmac('sha256', keySecret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (digest !== razorpay_signature) {
      throw new BadRequestException('Invalid payment signature');
    }

    // Get tutor ID from metadata
    const metadata = payment.metadata as any;
    const tutorId = metadata?.tutorId;
    if (!tutorId) {
      throw new BadRequestException('Payment metadata missing tutor ID');
    }

    const studentId = await this.resolveStudentId(userId);
    const tokensPurchased = Number(payment.tokensPurchased ?? 0);
    if (!Number.isFinite(tokensPurchased) || tokensPurchased <= 0) {
      throw new BadRequestException('Invalid token amount on payment');
    }

    const amountInMinor = Number(payment.amountInMinor ?? 0);
    const pricePerToken = tokensPurchased > 0
      ? amountInMinor / 100 / tokensPurchased
      : 0;

    // Credit tokens to student via token ledger
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 60); // 60 day expiry

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: razorpay_payment_id,
          providerSignature: razorpay_signature,
          status: 'SUCCEEDED',
        },
      });

      const existingLedger = await tx.tokenLedger.findFirst({
        where: { paymentId: payment.id, studentId },
        select: { id: true },
      });

      if (!existingLedger) {
        await tx.tokenLedger.create({
          data: {
            studentId,
            tutorId,
            delta: new Prisma.Decimal(tokensPurchased.toString()),
            reason: TokenReason.PURCHASED,
            expiresAt: expiryDate,
            paymentId: payment.id,
          },
        });

        await tx.student.update({
          where: { id: studentId },
          data: { tokens: { increment: tokensPurchased } },
        });

        await tx.tutorTokenBalance.upsert({
          where: {
            studentId_tutorId: {
              studentId,
              tutorId,
            },
          },
          update: {
            balance: { increment: tokensPurchased },
            // NOTE: pricePerToken on TutorTokenBalance is kept up-to-date for backward-compat
            // (display, legacy fallback). Authoritative per-purchase price lives on TutorTokenLot.
            pricePerToken: new Prisma.Decimal(pricePerToken.toString()),
          },
          create: {
            studentId,
            tutorId,
            balance: new Prisma.Decimal(tokensPurchased.toString()),
            pricePerToken: new Prisma.Decimal(pricePerToken.toString()),
          },
        });

        // FIFO lot: append a new TutorTokenLot capturing the immutable price
        // the student paid for THIS specific batch. Bookings drain lots oldest-first;
        // earnings calc reads lot prices via BookingLotConsumption.
        await tx.tutorTokenLot.create({
          data: {
            studentId,
            tutorId,
            pricePerToken: new Prisma.Decimal(pricePerToken.toString()),
            initialQty: new Prisma.Decimal(tokensPurchased.toString()),
            remainingQty: new Prisma.Decimal(tokensPurchased.toString()),
            paymentId: payment.id,
            expiresAt: expiryDate,
          },
        });
      }
    });

    // Send in-app notification and email receipt to student after successful purchase
    const studentUser = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { user: { select: { id: true, email: true, name: true } } },
    });
    const tutorUser = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { user: { select: { id: true, email: true, name: true } } },
    });

    if (studentUser?.user?.id) {
      this.notifications.createPaymentNotification(
        studentUser.user.id,
        'Token Purchase Successful',
        `You have successfully purchased ${tokensPurchased} token${tokensPurchased === 1 ? '' : 's'}. They are ready to use for booking sessions.`,
      ).catch((err) => this.logger.error(`In-app payment notification failed: ${err?.message ?? err}`));

      if (studentUser.user.email) {
        this.logger.log(`Sending payment receipt email to ${studentUser.user.email} for ${tokensPurchased} tokens`);
        this.notifications.paymentReceiptEmail({
          studentEmail: studentUser.user.email,
          studentName: studentUser.user.name ?? undefined,
          tutorName: tutorUser?.user?.name ?? undefined,
          tokensPurchased,
          amountPaid: amountInMinor,
          currency: process.env.CURRENCY ?? 'INR',
          paymentId: payment.id,
          providerOrderId: payment.providerOrderId ?? undefined,
          purchasedAt: new Date().toISOString(),
          expiryDate: expiryDate.toISOString(),
        }).then(() => this.logger.log(`Payment receipt email sent to ${studentUser.user.email}`))
          .catch((err) => this.logger.error(`Payment receipt email FAILED for ${studentUser.user.email}: ${err?.message ?? err}`));
      }
    }

    // Notify tutor about the purchase + check availability
    if (tutorUser?.user) {
      const studentName = studentUser?.user?.name ?? 'A student';

      // In-app notification for tutor
      if (tutorUser.user.id) {
        this.notifications.createPaymentNotification(
          tutorUser.user.id,
          'New Token Purchase',
          `${studentName} has purchased ${tokensPurchased} token${tokensPurchased === 1 ? '' : 's'} for your sessions.`,
        ).catch((err) => this.logger.error(`Tutor in-app notification failed: ${err?.message ?? err}`));
      }

      // Email to tutor about purchase
      if (tutorUser.user.email) {
        this.notifications.tutorTokenPurchaseEmail({
          tutorEmail: tutorUser.user.email,
          tutorName: tutorUser.user.name ?? undefined,
          studentName,
          tokensPurchased,
        }).catch((err) => this.logger.error(`Tutor purchase email FAILED: ${err?.message ?? err}`));
      }

      // Check tutor's upcoming availability — if < 2 slots, send low-availability reminder
      this.checkTutorAvailabilityAndRemind(tutorId, tutorUser.user.email, tutorUser.user.name)
        .catch((err) => this.logger.error(`Low-availability check failed: ${err?.message ?? err}`));
    }

    return {
      ok: true,
      paymentId: payment.id,
    };
  }

  /**
   * Check if tutor has fewer than 2 upcoming slots. If so, email them a reminder
   * listing all students with remaining tokens.
   */
  private async checkTutorAvailabilityAndRemind(
    tutorId: string,
    tutorEmail?: string | null,
    tutorName?: string | null,
  ): Promise<void> {
    if (!tutorEmail) return;

    const now = new Date();
    const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    // Count upcoming availability slots in the next 10 days
    const totalSlots = await this.prisma.availabilitySlot.count({
      where: {
        tutorId,
        startTime: { gte: now, lte: tenDaysFromNow },
      },
    });

    // Count how many of those have a confirmed booking overlapping
    const bookedCount = await this.prisma.booking.count({
      where: {
        tutorId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        startTime: { gte: now, lte: tenDaysFromNow },
      },
    });

    const upcomingSlotCount = totalSlots - bookedCount;

    if (upcomingSlotCount >= 2) return; // Enough availability, no reminder needed

    // Get all students with remaining token balance for this tutor
    const tokenBalances = await this.prisma.tutorTokenBalance.findMany({
      where: {
        tutorId,
        balance: { gt: 0 },
      },
      select: {
        balance: true,
        student: { select: { user: { select: { name: true } } } },
      },
    });

    if (tokenBalances.length === 0) return;

    const students = tokenBalances.map((tb) => ({
      name: tb.student?.user?.name || 'Student',
      remainingTokens: Number(tb.balance),
    }));

    this.notifications.lowAvailabilityReminderEmail({
      tutorEmail,
      tutorName: tutorName ?? undefined,
      upcomingSlotCount,
      students,
    }).catch((err) => this.logger.error(`Low-availability reminder email FAILED: ${err?.message ?? err}`));
  }

  /**
   * Called by the frontend when Razorpay checkout returns an error (payment.failed).
   * Marks the payment as FAILED and sends a failure notification email.
   */
  async reportPaymentFailed(
    userId: string,
    dto: { razorpay_order_id: string; error_reason?: string },
  ): Promise<{ ok: boolean }> {
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: dto.razorpay_order_id, userId },
      select: { id: true, amountInMinor: true, status: true },
    });

    if (!payment || payment.status === 'SUCCEEDED') {
      return { ok: true }; // Nothing to do
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (user?.email) {
      this.notifications.sendPaymentFailedEmail({
        to: user.email,
        studentName: user.name ?? undefined,
        amountInMinor: Number(payment.amountInMinor ?? 0),
        paymentId: payment.id,
        reason: dto.error_reason ?? 'Payment was declined or cancelled.',
      }).catch((err) => this.logger.warn(`Payment failed email error: ${err?.message}`));
    }

    return { ok: true };
  }
}
