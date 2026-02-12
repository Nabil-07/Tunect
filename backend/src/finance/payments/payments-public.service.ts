import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, TokenReason } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'node:crypto';

const TOKENS_PER_HOUR = 1;

@Injectable()
export class PaymentsPublicService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
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
            pricePerToken: new Prisma.Decimal(pricePerToken.toString()),
          },
          create: {
            studentId,
            tutorId,
            balance: new Prisma.Decimal(tokensPurchased.toString()),
            pricePerToken: new Prisma.Decimal(pricePerToken.toString()),
          },
        });
      }
    });

    return {
      ok: true,
      paymentId: payment.id,
    };
  }
}
