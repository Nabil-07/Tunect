import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface PricingContext {
  tutorId: string;
  packId: string;
  userId?: string;
  couponCode?: string;
}

export interface PackPricing {
  pack: {
    id: string;
    name: string;
    displayLabel: string;
    tokenCount: number;
    badgeLabel: string | null;
    isHighlighted: boolean;
    displayOrder: number;
  };
  bracket: {
    id: string;
    name: string;
    commissionPct: number;
  } | null;
  basePrice: number;       // INR before any discount
  pricePerToken: number;   // INR per token
  packDiscount: number;    // INR discount from pack offer
  finalPrice: number;      // INR after pack discount
  perClassPrice: number;   // INR per class after discount
}

export interface CartPricing extends PackPricing {
  couponDiscount: number;
  totalPrice: number;      // final price after coupon
  couponCode: string | null;
  appliedCouponId: string | null;
}

@Injectable()
export class PricingEngineService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find the fee bracket that applies to a given tutor hourly rate */
  async resolveBracket(hourlyRate: number) {
    const brackets = await this.prisma.feeBracket.findMany({
      where: { isActive: true },
      orderBy: { minRate: 'asc' },
    });

    for (const bracket of brackets) {
      const min = Number(bracket.minRate);
      const max = bracket.maxRate != null ? Number(bracket.maxRate) : Infinity;
      if (hourlyRate >= min && hourlyRate <= max) {
        return bracket;
      }
    }
    return null;
  }

  /** Compute the base price for a pack (tokens × pricePerToken) */
  computeBasePrice(tokenCount: number, pricePerToken: number): number {
    return tokenCount * pricePerToken;
  }

  /** Compute the pack offer discount for a bracket/pack combination */
  async computePackDiscount(packId: string, bracketId: string | null, basePrice: number): Promise<number> {
    if (!bracketId) return 0;

    const now = new Date();
    const offer = await this.prisma.packOffer.findFirst({
      where: {
        packId,
        bracketId,
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
    });

    if (!offer) return 0;

    if (offer.discountType === 'FIXED_AMOUNT') {
      const discount = Number(offer.discountValue);
      const cap = offer.discountCap != null ? Number(offer.discountCap) : Infinity;
      return Math.min(discount, cap, basePrice);
    } else {
      const pct = Number(offer.discountValue) / 100;
      const raw = basePrice * pct;
      const cap = offer.discountCap != null ? Number(offer.discountCap) : Infinity;
      return Math.min(raw, cap, basePrice);
    }
  }

  /** Compute full pricing for a single pack given a tutor's hourly rate */
  async computePackPricing(pack: {
    id: string; name: string; displayLabel: string; tokenCount: number;
    badgeLabel: string | null; isHighlighted: boolean; displayOrder: number;
  }, hourlyRate: number): Promise<PackPricing> {
    const pricePerToken = Math.ceil(hourlyRate);
    const basePrice = this.computeBasePrice(pack.tokenCount, pricePerToken);

    const bracket = await this.resolveBracket(hourlyRate);
    const packDiscount = await this.computePackDiscount(pack.id, bracket?.id ?? null, basePrice);

    const finalPrice = basePrice - packDiscount;
    const perClassPrice = pack.tokenCount > 0 ? finalPrice / pack.tokenCount : finalPrice;

    return {
      pack,
      bracket: bracket
        ? { id: bracket.id, name: bracket.name, commissionPct: Number(bracket.commissionPct) }
        : null,
      basePrice,
      pricePerToken,
      packDiscount,
      finalPrice,
      perClassPrice,
    };
  }

  /** Validate and compute coupon discount */
  async computeCouponDiscount(
    couponCode: string,
    userId: string,
    packId: string,
    bracketId: string | null,
    cartValue: number,
  ): Promise<{ discount: number; couponId: string; description: string | null }> {
    const now = new Date();
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        code: { equals: couponCode, mode: 'insensitive' },
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      include: {
        couponBrackets: true,
        couponPacks: true,
        couponUsers: true,
      },
    });

    if (!coupon) throw new BadRequestException('Invalid or expired coupon code');

    // Check min cart value
    if (coupon.minCartValue != null && cartValue < Number(coupon.minCartValue)) {
      throw new BadRequestException(
        `Minimum cart value of ₹${Number(coupon.minCartValue)} required for this coupon`,
      );
    }

    // Check total redemption limit
    if (coupon.totalRedemptionLimit != null && coupon.usedCount >= coupon.totalRedemptionLimit) {
      throw new BadRequestException('This coupon has reached its usage limit');
    }

    // Check bracket restriction
    if (coupon.couponBrackets.length > 0 && bracketId) {
      const allowed = coupon.couponBrackets.some((cb) => cb.bracketId === bracketId);
      if (!allowed) throw new BadRequestException('This coupon is not applicable for your tutor\'s fee bracket');
    }

    // Check pack restriction (skip when buying custom tokens — no pack selected)
    if (packId && coupon.couponPacks.length > 0) {
      const allowed = coupon.couponPacks.some((cp) => cp.packId === packId);
      if (!allowed) throw new BadRequestException('This coupon is not applicable to the selected pack');
    }

    // Check user restriction
    if (coupon.couponUsers.length > 0) {
      const allowed = coupon.couponUsers.some((cu) => cu.userId === userId);
      if (!allowed) throw new BadRequestException('This coupon is not available for your account');
    }

    // Check per-user usage frequency
    await this.validateUserUsageFrequency(coupon, userId);

    // Compute discount
    let discount = 0;
    if (coupon.discountType === 'FIXED_AMOUNT') {
      discount = Math.min(Number(coupon.discountValue), cartValue);
      if (coupon.discountCap != null) discount = Math.min(discount, Number(coupon.discountCap));
    } else {
      const raw = cartValue * (Number(coupon.discountValue) / 100);
      discount = coupon.discountCap != null ? Math.min(raw, Number(coupon.discountCap)) : raw;
      discount = Math.min(discount, cartValue);
    }

    return { discount: Math.round(discount), couponId: coupon.id, description: coupon.description };
  }

  private async validateUserUsageFrequency(coupon: any, userId: string) {
    const freq = coupon.usageFrequency as string;
    if (freq === 'UNLIMITED') return;

    const perUserLimit = coupon.perUserLimit;
    let windowStart: Date | null = null;

    if (freq === 'ONE_TIME') {
      const count = await this.prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
      if (count > 0) throw new BadRequestException('This coupon can only be used once per user');
      return;
    }

    if (freq === 'CUSTOM' && coupon.customUsageLimit != null) {
      const count = await this.prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
      if (count >= coupon.customUsageLimit) throw new BadRequestException('You have reached the maximum usage limit for this coupon');
      return;
    }

    const now = new Date();
    if (freq === 'ONCE_PER_MONTH') {
      windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (freq === 'ONCE_PER_QUARTER') {
      const quarter = Math.floor(now.getMonth() / 3);
      windowStart = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (freq === 'ONCE_PER_YEAR') {
      windowStart = new Date(now.getFullYear(), 0, 1);
    }

    if (windowStart) {
      const count = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, userId, usedAt: { gte: windowStart } },
      });
      if (count > 0) throw new BadRequestException(`This coupon can only be used once per ${freq.replace('ONCE_PER_', '').toLowerCase()}`);
    }

    if (perUserLimit != null) {
      const total = await this.prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
      if (total >= perUserLimit) throw new BadRequestException('You have reached the maximum usage limit for this coupon');
    }
  }

  /** Get all active packs with pricing for a given tutor */
  async getPacksForTutor(tutorId: string): Promise<PackPricing[]> {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { hourlyRate: true },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');

    const hourlyRate = Number(tutor.hourlyRate ?? 0);

    const packs = await this.prisma.tokenPack.findMany({
      where: { isActive: true, isVisible: true },
      orderBy: { displayOrder: 'asc' },
    });

    return Promise.all(
      packs.map((p) =>
        this.computePackPricing(
          {
            id: p.id,
            name: p.name,
            displayLabel: p.displayLabel,
            tokenCount: p.tokenCount,
            badgeLabel: p.badgeLabel,
            isHighlighted: p.isHighlighted,
            displayOrder: p.displayOrder,
          },
          hourlyRate,
        ),
      ),
    );
  }

  /** Full cart pricing with coupon */
  async computeCartPricing(ctx: PricingContext): Promise<CartPricing> {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: ctx.tutorId },
      select: { hourlyRate: true },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');

    const pack = await this.prisma.tokenPack.findFirst({
      where: { id: ctx.packId, isActive: true },
    });
    if (!pack) throw new NotFoundException('Token pack not found or inactive');

    const hourlyRate = Number(tutor.hourlyRate ?? 0);
    const packPricing = await this.computePackPricing(
      {
        id: pack.id, name: pack.name, displayLabel: pack.displayLabel,
        tokenCount: pack.tokenCount, badgeLabel: pack.badgeLabel,
        isHighlighted: pack.isHighlighted, displayOrder: pack.displayOrder,
      },
      hourlyRate,
    );

    let couponDiscount = 0;
    let appliedCouponId: string | null = null;

    if (ctx.couponCode && ctx.userId) {
      const result = await this.computeCouponDiscount(
        ctx.couponCode,
        ctx.userId,
        ctx.packId,
        packPricing.bracket?.id ?? null,
        packPricing.finalPrice,
      );
      couponDiscount = result.discount;
      appliedCouponId = result.couponId;
    }

    const totalPrice = Math.max(0, packPricing.finalPrice - couponDiscount);

    return {
      ...packPricing,
      couponDiscount,
      totalPrice,
      couponCode: ctx.couponCode ?? null,
      appliedCouponId,
    };
  }

  /** Record coupon usage after successful payment */
  async recordCouponUsage(couponId: string, userId: string, paymentId: string) {
    await this.prisma.$transaction([
      this.prisma.couponUsage.create({
        data: { couponId, userId, paymentId },
      }),
      this.prisma.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      }),
    ]);
  }
}
