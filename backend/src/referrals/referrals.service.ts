import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReferralDto, ProcessReferralRewardDto } from './dto/referral.dto';
import { randomBytes } from 'crypto';

const REFERRAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateReferralCodeValue(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return out;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private readonly REFERRER_REWARD = 100; // Tokens for referrer
  private readonly REFERRED_BONUS = 50; // Tokens for new user

  constructor(private prisma: PrismaService) {}

  /**
   * Generate a unique referral code for a student
   */
  async generateReferralCode(userId: string): Promise<string> {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    let referralCode: string;
    let isUnique = false;

    // Generate unique code
    while (!isUnique) {
      referralCode = generateReferralCodeValue(8);
      const existing = await this.prisma.referral.findUnique({
        where: { referralCode },
      });
      isUnique = !existing;
    }

    return referralCode!;
  }

  /**
   * Create a referral invitation
   */
  async create(userId: string, dto: CreateReferralDto) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    // Check if user is trying to refer themselves
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.referredEmail },
    });

    if (existingUser && existingUser.id === userId) {
      throw new BadRequestException('You cannot refer yourself');
    }

    // Check if already referred
    const existingReferral = await this.prisma.referral.findFirst({
      where: {
        referrerId: student.id,
        referredEmail: dto.referredEmail,
      },
    });

    if (existingReferral) {
      return existingReferral;
    }

    // Generate unique code
    const referralCode = await this.generateReferralCode(userId);

    return this.prisma.referral.create({
      data: {
        referrerId: student.id,
        referredEmail: dto.referredEmail,
        referralCode,
      },
    });
  }

  /**
   * Get user's referral code (create if doesn't exist)
   */
  async getMyReferralCode(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    // Try to find existing referral code
    const existingReferral = await this.prisma.referral.findFirst({
      where: { referrerId: student.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existingReferral) {
      return {
        referralCode: existingReferral.referralCode,
        totalReferrals: await this.prisma.referral.count({
          where: { referrerId: student.id },
        }),
        successfulReferrals: await this.prisma.referral.count({
          where: {
            referrerId: student.id,
            status: 'COMPLETED',
          },
        }),
        tokensEarned: await this.prisma.referral.aggregate({
          where: {
            referrerId: student.id,
            status: 'COMPLETED',
          },
          _sum: {
            tokensEarned: true,
          },
        }),
      };
    }

    // Generate new code
    const code = await this.generateReferralCode(userId);
    return {
      referralCode: code,
      totalReferrals: 0,
      successfulReferrals: 0,
      tokensEarned: { _sum: { tokensEarned: 0 } },
    };
  }

  /**
   * Get all referrals made by user
   */
  async findMyReferrals(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.referral.findMany({
      where: { referrerId: student.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Apply referral code during signup
   */
  async applyReferralCode(referralCode: string, newUserEmail: string): Promise<string | null> {
    const referral = await this.prisma.referral.findUnique({
      where: { referralCode },
    });

    if (!referral) {
      this.logger.warn(`Invalid referral code: ${referralCode}`);
      return null;
    }

    // Check if code matches the invited email
    if (referral.referredEmail.toLowerCase() !== newUserEmail.toLowerCase()) {
      this.logger.warn(`Referral code email mismatch: ${referralCode}`);
      return null;
    }

    return referral.id;
  }

  /**
   * Link referral to newly created student
   */
  async linkReferralToStudent(referralId: string, studentId: string) {
    await this.prisma.referral.update({
      where: { id: referralId },
      data: {
        referredId: studentId,
        status: 'PENDING', // Waiting for first paid session
      },
    });
  }

  /**
   * Process referral rewards after first paid session
   * Called by payment/booking service
   */
  async processReferralReward(dto: ProcessReferralRewardDto) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
    });

    if (!student) {
      return;
    }

    // Find pending referral for this student
    const referral = await this.prisma.referral.findFirst({
      where: {
        referredId: student.id,
        status: 'PENDING',
      },
      include: {
        Student_Referral_referrerIdToStudent: true,
      },
    });

    if (!referral) {
      return; // No referral to process
    }

    // Check if this is their first PAID session
    const paidSessions = await this.prisma.booking.count({
      where: {
        studentId: dto.studentId,
        status: 'COMPLETED',
        tokensCharged: {
          gt: 0,
        },
      },
    });

    if (paidSessions > 1) {
      return; // Not their first paid session
    }

    try {
      // Award tokens in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Update referral status
        await tx.referral.update({
          where: { id: referral.id },
          data: {
            status: 'COMPLETED',
            tokensEarned: this.REFERRER_REWARD,
            referredUserBonus: this.REFERRED_BONUS,
            firstPaidSessionId: dto.bookingId,
            completedAt: new Date(),
          },
        });

        // Award tokens to referrer (update student tokens)
        await tx.student.update({
          where: { id: referral.referrerId },
          data: {
            tokens: {
              increment: this.REFERRER_REWARD,
            },
          },
        });

        // Award bonus to referred user
        await tx.student.update({
          where: { id: student.id },
          data: {
            tokens: {
              increment: this.REFERRED_BONUS,
            },
          },
        });

        this.logger.log(
          `Referral reward processed: ${this.REFERRER_REWARD} tokens to referrer, ${this.REFERRED_BONUS} to new user`,
        );
      });
    } catch (error) {
      this.logger.error('Failed to process referral reward:', error);
      throw error;
    }
  }

  /**
   * Validate referral code
   */
  async validateReferralCode(code: string): Promise<boolean> {
    const referral = await this.prisma.referral.findUnique({
      where: { referralCode: code },
    });

    return !!referral;
  }
}
