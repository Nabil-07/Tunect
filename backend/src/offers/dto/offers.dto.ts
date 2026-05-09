import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, IsDateString, IsInt, Min, IsArray } from 'class-validator';

// ─── Fee Bracket DTOs ─────────────────────────────────────────────────────────

export class CreateFeeBracketDto {
  @IsString() name!: string;
  @IsNumber() @Min(0) minRate!: number;
  @IsOptional() @IsNumber() @Min(0) maxRate?: number;
  @IsNumber() @Min(0) commissionPct!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() displayOrder?: number;
}

export class UpdateFeeBracketDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) minRate?: number;
  @IsOptional() @IsNumber() @Min(0) maxRate?: number;
  @IsOptional() @IsNumber() @Min(0) commissionPct?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() displayOrder?: number;
}

// ─── Token Pack DTOs ───────────────────────────────────────────────────────────

export class CreateTokenPackDto {
  @IsString() name!: string;
  @IsString() displayLabel!: string;
  @IsInt() @Min(1) tokenCount!: number;
  @IsOptional() @IsString() badgeLabel?: string;
  @IsOptional() @IsBoolean() isHighlighted?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsInt() @Min(1) maxPurchaseLimit?: number;
}

export class UpdateTokenPackDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() displayLabel?: string;
  @IsOptional() @IsInt() @Min(1) tokenCount?: number;
  @IsOptional() @IsString() badgeLabel?: string;
  @IsOptional() @IsBoolean() isHighlighted?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsInt() @Min(1) maxPurchaseLimit?: number;
}

// ─── Pack Offer DTOs ──────────────────────────────────────────────────────────

export class CreatePackOfferDto {
  @IsString() packId!: string;
  @IsString() bracketId!: string;
  @IsEnum(['FIXED_AMOUNT', 'PERCENTAGE']) discountType!: 'FIXED_AMOUNT' | 'PERCENTAGE';
  @IsNumber() @Min(0) discountValue!: number;
  @IsOptional() @IsNumber() @Min(0) discountCap?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePackOfferDto {
  @IsOptional() @IsString() packId?: string;
  @IsOptional() @IsString() bracketId?: string;
  @IsOptional() @IsEnum(['FIXED_AMOUNT', 'PERCENTAGE']) discountType?: 'FIXED_AMOUNT' | 'PERCENTAGE';
  @IsOptional() @IsNumber() @Min(0) discountValue?: number;
  @IsOptional() @IsNumber() @Min(0) discountCap?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Coupon DTOs ──────────────────────────────────────────────────────────────

export type CouponUsageFrequency = 'ONE_TIME' | 'ONCE_PER_MONTH' | 'ONCE_PER_QUARTER' | 'ONCE_PER_YEAR' | 'UNLIMITED' | 'CUSTOM';

export class CreateCouponDto {
  @IsString() code!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(['FIXED_AMOUNT', 'PERCENTAGE']) discountType!: 'FIXED_AMOUNT' | 'PERCENTAGE';
  @IsNumber() @Min(0) discountValue!: number;
  @IsOptional() @IsNumber() @Min(0) discountCap?: number;
  @IsOptional() @IsNumber() @Min(0) minCartValue?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsEnum(['ONE_TIME', 'ONCE_PER_MONTH', 'ONCE_PER_QUARTER', 'ONCE_PER_YEAR', 'UNLIMITED', 'CUSTOM'])
  usageFrequency?: CouponUsageFrequency;
  @IsOptional() @IsInt() @Min(1) customUsageLimit?: number;
  @IsOptional() @IsInt() @Min(1) totalRedemptionLimit?: number;
  @IsOptional() @IsInt() @Min(1) perUserLimit?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) applicableBracketIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) applicablePackIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) applicableUserIds?: string[];
}

export class UpdateCouponDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['FIXED_AMOUNT', 'PERCENTAGE']) discountType?: 'FIXED_AMOUNT' | 'PERCENTAGE';
  @IsOptional() @IsNumber() @Min(0) discountValue?: number;
  @IsOptional() @IsNumber() @Min(0) discountCap?: number;
  @IsOptional() @IsNumber() @Min(0) minCartValue?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsEnum(['ONE_TIME', 'ONCE_PER_MONTH', 'ONCE_PER_QUARTER', 'ONCE_PER_YEAR', 'UNLIMITED', 'CUSTOM'])
  usageFrequency?: CouponUsageFrequency;
  @IsOptional() @IsInt() @Min(1) customUsageLimit?: number;
  @IsOptional() @IsInt() @Min(1) totalRedemptionLimit?: number;
  @IsOptional() @IsInt() @Min(1) perUserLimit?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) applicableBracketIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) applicablePackIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) applicableUserIds?: string[];
}

// ─── Pack Purchase Rule DTOs ──────────────────────────────────────────────────

export type PackRuleType = 'MAX_PURCHASES_PER_PERIOD' | 'ONE_PER_CALENDAR_MONTH' | 'ONE_DISCOUNTED_AT_A_TIME' | 'ALLOW_MULTIPLE' | 'RESTRICT_DUPLICATE';

export class CreatePackRuleDto {
  @IsOptional() @IsString() packId?: string;
  @IsString() description!: string;
  @IsEnum(['MAX_PURCHASES_PER_PERIOD', 'ONE_PER_CALENDAR_MONTH', 'ONE_DISCOUNTED_AT_A_TIME', 'ALLOW_MULTIPLE', 'RESTRICT_DUPLICATE'])
  ruleType!: PackRuleType;
  @IsOptional() @IsInt() @Min(1) value?: number;
  @IsOptional() @IsInt() @Min(1) periodDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePackRuleDto {
  @IsOptional() @IsString() packId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['MAX_PURCHASES_PER_PERIOD', 'ONE_PER_CALENDAR_MONTH', 'ONE_DISCOUNTED_AT_A_TIME', 'ALLOW_MULTIPLE', 'RESTRICT_DUPLICATE'])
  ruleType?: PackRuleType;
  @IsOptional() @IsInt() @Min(1) value?: number;
  @IsOptional() @IsInt() @Min(1) periodDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Currency Config DTOs ─────────────────────────────────────────────────────

export class CreateCurrencyConfigDto {
  @IsString() code!: string;
  @IsString() symbol!: string;
  @IsString() name!: string;
  @IsNumber() @Min(0) exchangeRate!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateCurrencyConfigDto {
  @IsOptional() @IsString() symbol?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) exchangeRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

// ─── Apply Coupon DTO ─────────────────────────────────────────────────────────

export class ApplyCouponDto {
  @IsString() code!: string;
  @IsString() tutorId!: string;
  @IsOptional() @IsString() packId?: string;
  @IsOptional() @IsInt() @Min(1) tokens?: number;
}
