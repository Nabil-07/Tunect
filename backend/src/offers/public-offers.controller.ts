import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PricingEngineService } from './pricing-engine.service';
import { ApplyCouponDto } from './dto/offers.dto';

@ApiTags('offers')
@Controller('offers')
export class PublicOffersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  /**
   * GET /offers/packs?tutorId=...
   * Returns all active packs with computed pricing for the given tutor.
   * Public (no auth required) — used on the cart page before checkout.
   */
  @ApiOperation({ summary: 'Get token packs with dynamic pricing for a tutor' })
  @Get('packs')
  async getPacksForTutor(@Query('tutorId') tutorId: string) {
    if (!tutorId) {
      return { packs: [], bracketInfo: null };
    }
    const packs = await this.pricingEngine.getPacksForTutor(tutorId);
    const bracketInfo = packs[0]?.bracket ?? null;
    return { packs, bracketInfo };
  }

  /**
   * GET /offers/currencies
   * Returns all active currencies for display conversion.
   */
  @ApiOperation({ summary: 'Get active currency configurations' })
  @Get('currencies')
  async getCurrencies() {
    return this.prisma.currencyConfig.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { code: true, symbol: true, name: true, exchangeRate: true, isDefault: true },
    });
  }

  /**
   * POST /offers/apply-coupon
   * Validates a coupon and returns the discount amount.
   * Requires STUDENT auth.
   */
  @ApiOperation({ summary: 'Validate and apply a coupon code' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Post('apply-coupon')
  async applyCoupon(@Req() req: any, @Body() dto: ApplyCouponDto) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;

    // Pack mode: use full pack-based pricing
    if (dto.packId) {
      const cartPricing = await this.pricingEngine.computeCartPricing({
        tutorId: dto.tutorId,
        packId: dto.packId,
        userId,
        couponCode: dto.code,
      });

      return {
        valid: true,
        couponCode: dto.code.toUpperCase().trim(),
        couponDiscount: cartPricing.couponDiscount,
        finalPrice: cartPricing.totalPrice,
        packDiscount: cartPricing.packDiscount,
        basePrice: cartPricing.basePrice,
      };
    }

    // Manual token mode: compute cart value from tokens × pricePerToken
    const tokens = dto.tokens ?? 0;
    if (tokens < 1) {
      throw new Error('Either packId or tokens must be provided');
    }

    const tutor = await this.prisma.tutor.findUnique({
      where: { id: dto.tutorId },
      select: { hourlyRate: true },
    });
    if (!tutor) throw new Error('Tutor not found');

    const pricePerToken = Math.ceil(Number(tutor.hourlyRate ?? 0));
    const cartValue = pricePerToken * tokens;
    const bracket = await this.pricingEngine.resolveBracket(Number(tutor.hourlyRate ?? 0));

    const { discount, couponId } = await this.pricingEngine.computeCouponDiscount(
      dto.code,
      userId,
      '',           // no packId — pack restriction is skipped
      bracket?.id ?? null,
      cartValue,
    );

    return {
      valid: true,
      couponCode: dto.code.toUpperCase().trim(),
      couponDiscount: discount,
      finalPrice: Math.max(0, cartValue - discount),
      packDiscount: 0,
      basePrice: cartValue,
    };
  }

  /**
   * GET /offers/cart-pricing?tutorId=...&packId=...&couponCode=...
   * Full cart pricing computation for display.
   * Requires STUDENT auth.
   */
  @ApiOperation({ summary: 'Get full cart pricing breakdown' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('cart-pricing')
  async getCartPricing(
    @Req() req: any,
    @Query('tutorId') tutorId: string,
    @Query('packId') packId: string,
    @Query('couponCode') couponCode?: string,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;

    return this.pricingEngine.computeCartPricing({
      tutorId,
      packId,
      userId,
      couponCode: couponCode || undefined,
    });
  }
}
