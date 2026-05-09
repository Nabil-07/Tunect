import {
  Controller, Get, Post, Put, Delete, Body, Param,
  UseGuards, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PricingEngineService } from './pricing-engine.service';
import {
  CreateFeeBracketDto, UpdateFeeBracketDto,
  CreateTokenPackDto, UpdateTokenPackDto,
  CreatePackOfferDto, UpdatePackOfferDto,
  CreateCouponDto, UpdateCouponDto,
  CreatePackRuleDto, UpdatePackRuleDto,
  CreateCurrencyConfigDto, UpdateCurrencyConfigDto,
} from './dto/offers.dto';

@ApiTags('admin/offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/offers')
export class AdminOffersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  // ─── Fee Brackets ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all fee brackets' })
  @Get('fee-brackets')
  async listFeeBrackets() {
    return this.prisma.feeBracket.findMany({ orderBy: { minRate: 'asc' } });
  }

  @ApiOperation({ summary: 'Create a fee bracket' })
  @Post('fee-brackets')
  async createFeeBracket(@Body() dto: CreateFeeBracketDto) {
    return this.prisma.feeBracket.create({ data: dto });
  }

  @ApiOperation({ summary: 'Update a fee bracket' })
  @Put('fee-brackets/:id')
  async updateFeeBracket(@Param('id') id: string, @Body() dto: UpdateFeeBracketDto) {
    return this.prisma.feeBracket.update({ where: { id }, data: dto });
  }

  @ApiOperation({ summary: 'Delete a fee bracket' })
  @Delete('fee-brackets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFeeBracket(@Param('id') id: string) {
    await this.prisma.feeBracket.delete({ where: { id } });
  }

  // ─── Token Packs ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all token packs' })
  @Get('token-packs')
  async listTokenPacks() {
    return this.prisma.tokenPack.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { packOffers: { include: { bracket: true } } },
    });
  }

  @ApiOperation({ summary: 'Create a token pack' })
  @Post('token-packs')
  async createTokenPack(@Body() dto: CreateTokenPackDto) {
    return this.prisma.tokenPack.create({ data: dto });
  }

  @ApiOperation({ summary: 'Update a token pack' })
  @Put('token-packs/:id')
  async updateTokenPack(@Param('id') id: string, @Body() dto: UpdateTokenPackDto) {
    return this.prisma.tokenPack.update({ where: { id }, data: dto });
  }

  @ApiOperation({ summary: 'Delete a token pack' })
  @Delete('token-packs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTokenPack(@Param('id') id: string) {
    await this.prisma.tokenPack.delete({ where: { id } });
  }

  // ─── Pack Offers ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all pack offers' })
  @Get('pack-offers')
  async listPackOffers() {
    return this.prisma.packOffer.findMany({
      include: { pack: true, bracket: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @ApiOperation({ summary: 'Create a pack offer' })
  @Post('pack-offers')
  async createPackOffer(@Body() dto: CreatePackOfferDto) {
    return this.prisma.packOffer.create({
      data: {
        packId: dto.packId,
        bracketId: dto.bracketId,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        ...(dto.discountCap != null && { discountCap: dto.discountCap }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        isActive: dto.isActive ?? true,
      },
      include: { pack: true, bracket: true },
    });
  }

  @ApiOperation({ summary: 'Update a pack offer' })
  @Put('pack-offers/:id')
  async updatePackOffer(@Param('id') id: string, @Body() dto: UpdatePackOfferDto) {
    return this.prisma.packOffer.update({
      where: { id },
      data: {
        ...(dto.packId && { packId: dto.packId }),
        ...(dto.bracketId && { bracketId: dto.bracketId }),
        ...(dto.discountType && { discountType: dto.discountType }),
        ...(dto.discountValue != null && { discountValue: dto.discountValue }),
        ...(dto.discountCap != null && { discountCap: dto.discountCap }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
      include: { pack: true, bracket: true },
    });
  }

  @ApiOperation({ summary: 'Delete a pack offer' })
  @Delete('pack-offers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePackOffer(@Param('id') id: string) {
    await this.prisma.packOffer.delete({ where: { id } });
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all coupons' })
  @Get('coupons')
  async listCoupons(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        skip: (p - 1) * ps,
        take: ps,
        orderBy: { createdAt: 'desc' },
        include: {
          couponBrackets: { include: { bracket: true } },
          couponPacks: { include: { pack: true } },
          couponUsers: true,
          _count: { select: { usages: true } },
        },
      }),
      this.prisma.coupon.count(),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  @ApiOperation({ summary: 'Get a single coupon' })
  @Get('coupons/:id')
  async getCoupon(@Param('id') id: string) {
    return this.prisma.coupon.findUniqueOrThrow({
      where: { id },
      include: {
        couponBrackets: { include: { bracket: true } },
        couponPacks: { include: { pack: true } },
        couponUsers: true,
        usages: { orderBy: { usedAt: 'desc' }, take: 20 },
      },
    });
  }

  @ApiOperation({ summary: 'Create a coupon' })
  @Post('coupons')
  async createCoupon(@Body() dto: CreateCouponDto) {
    const { applicableBracketIds, applicablePackIds, applicableUserIds, ...rest } = dto;

    return this.prisma.coupon.create({
      data: {
        ...rest,
        code: rest.code.toUpperCase().trim(),
        ...(rest.startDate && { startDate: new Date(rest.startDate) }),
        ...(rest.endDate && { endDate: new Date(rest.endDate) }),
        couponBrackets: applicableBracketIds?.length
          ? { create: applicableBracketIds.map((bracketId) => ({ bracketId })) }
          : undefined,
        couponPacks: applicablePackIds?.length
          ? { create: applicablePackIds.map((packId) => ({ packId })) }
          : undefined,
        couponUsers: applicableUserIds?.length
          ? { create: applicableUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        couponBrackets: { include: { bracket: true } },
        couponPacks: { include: { pack: true } },
      },
    });
  }

  @ApiOperation({ summary: 'Update a coupon' })
  @Put('coupons/:id')
  async updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    const { applicableBracketIds, applicablePackIds, applicableUserIds, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (applicableBracketIds !== undefined) {
        await tx.couponBracket.deleteMany({ where: { couponId: id } });
      }
      if (applicablePackIds !== undefined) {
        await tx.couponPack.deleteMany({ where: { couponId: id } });
      }
      if (applicableUserIds !== undefined) {
        await tx.couponUser.deleteMany({ where: { couponId: id } });
      }

      return tx.coupon.update({
        where: { id },
        data: {
          ...rest,
          ...(rest.code && { code: rest.code.toUpperCase().trim() }),
          ...(rest.startDate !== undefined && { startDate: rest.startDate ? new Date(rest.startDate) : null }),
          ...(rest.endDate !== undefined && { endDate: rest.endDate ? new Date(rest.endDate) : null }),
          ...(applicableBracketIds !== undefined && {
            couponBrackets: { create: applicableBracketIds.map((bracketId) => ({ bracketId })) },
          }),
          ...(applicablePackIds !== undefined && {
            couponPacks: { create: applicablePackIds.map((packId) => ({ packId })) },
          }),
          ...(applicableUserIds !== undefined && {
            couponUsers: { create: applicableUserIds.map((userId) => ({ userId })) },
          }),
        },
        include: {
          couponBrackets: { include: { bracket: true } },
          couponPacks: { include: { pack: true } },
        },
      });
    });
  }

  @ApiOperation({ summary: 'Delete a coupon' })
  @Delete('coupons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCoupon(@Param('id') id: string) {
    await this.prisma.coupon.delete({ where: { id } });
  }

  // ─── Pack Purchase Rules ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all pack purchase rules' })
  @Get('pack-rules')
  async listPackRules() {
    return this.prisma.packPurchaseRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: { pack: true },
    });
  }

  @ApiOperation({ summary: 'Create a pack purchase rule' })
  @Post('pack-rules')
  async createPackRule(@Body() dto: CreatePackRuleDto) {
    return this.prisma.packPurchaseRule.create({ data: dto, include: { pack: true } });
  }

  @ApiOperation({ summary: 'Update a pack purchase rule' })
  @Put('pack-rules/:id')
  async updatePackRule(@Param('id') id: string, @Body() dto: UpdatePackRuleDto) {
    return this.prisma.packPurchaseRule.update({ where: { id }, data: dto, include: { pack: true } });
  }

  @ApiOperation({ summary: 'Delete a pack purchase rule' })
  @Delete('pack-rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePackRule(@Param('id') id: string) {
    await this.prisma.packPurchaseRule.delete({ where: { id } });
  }

  // ─── Currency Config ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all currency configs' })
  @Get('currencies')
  async listCurrencies() {
    return this.prisma.currencyConfig.findMany({ orderBy: { code: 'asc' } });
  }

  @ApiOperation({ summary: 'Create a currency config' })
  @Post('currencies')
  async createCurrency(@Body() dto: CreateCurrencyConfigDto) {
    if (dto.isDefault) {
      await this.prisma.currencyConfig.updateMany({ data: { isDefault: false } });
    }
    return this.prisma.currencyConfig.create({ data: dto });
  }

  @ApiOperation({ summary: 'Update a currency config' })
  @Put('currencies/:id')
  async updateCurrency(@Param('id') id: string, @Body() dto: UpdateCurrencyConfigDto) {
    if (dto.isDefault) {
      await this.prisma.currencyConfig.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    }
    return this.prisma.currencyConfig.update({ where: { id }, data: dto });
  }

  @ApiOperation({ summary: 'Delete a currency config' })
  @Delete('currencies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCurrency(@Param('id') id: string) {
    await this.prisma.currencyConfig.delete({ where: { id } });
  }

  // ─── Overview Stats ───────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get offers & packs summary stats' })
  @Get('stats')
  async getStats() {
    const [packs, brackets, coupons, currencies] = await Promise.all([
      this.prisma.tokenPack.count({ where: { isActive: true } }),
      this.prisma.feeBracket.count({ where: { isActive: true } }),
      this.prisma.coupon.count({ where: { isActive: true } }),
      this.prisma.currencyConfig.count({ where: { isActive: true } }),
    ]);
    return { activePacks: packs, activeBrackets: brackets, activeCoupons: coupons, activeCurrencies: currencies };
  }
}
