import { http as api } from '../api/http';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscountType = 'FIXED_AMOUNT' | 'PERCENTAGE';
export type CouponUsageFrequency = 'ONE_TIME' | 'ONCE_PER_MONTH' | 'ONCE_PER_QUARTER' | 'ONCE_PER_YEAR' | 'UNLIMITED' | 'CUSTOM';
export type PackRuleType = 'MAX_PURCHASES_PER_PERIOD' | 'ONE_PER_CALENDAR_MONTH' | 'ONE_DISCOUNTED_AT_A_TIME' | 'ALLOW_MULTIPLE' | 'RESTRICT_DUPLICATE';

export interface BracketInfo {
  id: string;
  name: string;
  commissionPct: number;
}

export interface PackInfo {
  id: string;
  name: string;
  displayLabel: string;
  tokenCount: number;
  badgeLabel: string | null;
  isHighlighted: boolean;
  displayOrder: number;
}

export interface PackPricing {
  pack: PackInfo;
  bracket: BracketInfo | null;
  basePrice: number;
  pricePerToken: number;
  packDiscount: number;
  finalPrice: number;
  perClassPrice: number;
}

export interface CartPricing extends PackPricing {
  couponDiscount: number;
  totalPrice: number;
  couponCode: string | null;
  appliedCouponId: string | null;
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  exchangeRate: number;
  isActive: boolean;
  isDefault: boolean;
}

// Admin types
export interface FeeBracket {
  id: string;
  name: string;
  minRate: number;
  maxRate: number | null;
  commissionPct: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPack {
  id: string;
  name: string;
  displayLabel: string;
  tokenCount: number;
  badgeLabel: string | null;
  isHighlighted: boolean;
  isActive: boolean;
  isVisible: boolean;
  displayOrder: number;
  maxPurchaseLimit: number | null;
  createdAt: string;
  updatedAt: string;
  packOffers?: PackOffer[];
}

export interface PackOffer {
  id: string;
  packId: string;
  bracketId: string;
  discountType: DiscountType;
  discountValue: number;
  discountCap: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  pack?: TokenPack;
  bracket?: FeeBracket;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  discountCap: number | null;
  minCartValue: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  usageFrequency: CouponUsageFrequency;
  customUsageLimit: number | null;
  totalRedemptionLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  createdAt: string;
  couponBrackets?: Array<{ bracketId: string; bracket: FeeBracket }>;
  couponPacks?: Array<{ packId: string; pack: TokenPack }>;
  _count?: { usages: number };
}

export interface PackPurchaseRule {
  id: string;
  packId: string | null;
  description: string;
  ruleType: PackRuleType;
  value: number | null;
  periodDays: number | null;
  isActive: boolean;
  pack?: TokenPack | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetch all active token packs with pricing for a specific tutor */
export async function getPacksForTutor(tutorId: string): Promise<{ packs: PackPricing[]; bracketInfo: BracketInfo | null }> {
  const { data } = await api.get('/offers/packs', { params: { tutorId } });
  return data;
}

/** Fetch active currencies */
export async function getActiveCurrencies(): Promise<CurrencyConfig[]> {
  const { data } = await api.get('/offers/currencies');
  return data;
}

/** Apply/validate a coupon code. Provide packId for pack mode, or tokens for manual mode. */
export async function applyCoupon(payload: {
  code: string;
  tutorId: string;
  packId?: string;
  tokens?: number;
}): Promise<{
  valid: boolean;
  couponCode: string;
  couponDiscount: number;
  finalPrice: number;
  packDiscount: number;
  basePrice: number;
}> {
  const { data } = await api.post('/offers/apply-coupon', payload);
  return data;
}

/** Get full cart pricing breakdown */
export async function getCartPricing(tutorId: string, packId: string, couponCode?: string): Promise<CartPricing> {
  const { data } = await api.get('/offers/cart-pricing', {
    params: { tutorId, packId, ...(couponCode && { couponCode }) },
  });
  return data;
}

// ─── Admin API ────────────────────────────────────────────────────────────────

// Fee Brackets
export async function adminListFeeBrackets(): Promise<FeeBracket[]> {
  const { data } = await api.get('/admin/offers/fee-brackets');
  return data;
}
export async function adminCreateFeeBracket(dto: Partial<FeeBracket>): Promise<FeeBracket> {
  const { data } = await api.post('/admin/offers/fee-brackets', dto);
  return data;
}
export async function adminUpdateFeeBracket(id: string, dto: Partial<FeeBracket>): Promise<FeeBracket> {
  const { data } = await api.put(`/admin/offers/fee-brackets/${id}`, dto);
  return data;
}
export async function adminDeleteFeeBracket(id: string): Promise<void> {
  await api.delete(`/admin/offers/fee-brackets/${id}`);
}

// Token Packs
export async function adminListTokenPacks(): Promise<TokenPack[]> {
  const { data } = await api.get('/admin/offers/token-packs');
  return data;
}
export async function adminCreateTokenPack(dto: Partial<TokenPack>): Promise<TokenPack> {
  const { data } = await api.post('/admin/offers/token-packs', dto);
  return data;
}
export async function adminUpdateTokenPack(id: string, dto: Partial<TokenPack>): Promise<TokenPack> {
  const { data } = await api.put(`/admin/offers/token-packs/${id}`, dto);
  return data;
}
export async function adminDeleteTokenPack(id: string): Promise<void> {
  await api.delete(`/admin/offers/token-packs/${id}`);
}

// Pack Offers
export async function adminListPackOffers(): Promise<PackOffer[]> {
  const { data } = await api.get('/admin/offers/pack-offers');
  return data;
}
export async function adminCreatePackOffer(dto: Partial<PackOffer>): Promise<PackOffer> {
  const { data } = await api.post('/admin/offers/pack-offers', dto);
  return data;
}
export async function adminUpdatePackOffer(id: string, dto: Partial<PackOffer>): Promise<PackOffer> {
  const { data } = await api.put(`/admin/offers/pack-offers/${id}`, dto);
  return data;
}
export async function adminDeletePackOffer(id: string): Promise<void> {
  await api.delete(`/admin/offers/pack-offers/${id}`);
}

// Coupons
export async function adminListCoupons(page = 1, pageSize = 50): Promise<{ items: Coupon[]; total: number; page: number; pageSize: number }> {
  const { data } = await api.get('/admin/offers/coupons', { params: { page, pageSize } });
  return data;
}
export async function adminGetCoupon(id: string): Promise<Coupon> {
  const { data } = await api.get(`/admin/offers/coupons/${id}`);
  return data;
}
export async function adminCreateCoupon(dto: Partial<Coupon> & { applicableBracketIds?: string[]; applicablePackIds?: string[]; applicableUserIds?: string[] }): Promise<Coupon> {
  const { data } = await api.post('/admin/offers/coupons', dto);
  return data;
}
export async function adminUpdateCoupon(id: string, dto: Partial<Coupon> & { applicableBracketIds?: string[]; applicablePackIds?: string[]; applicableUserIds?: string[] }): Promise<Coupon> {
  const { data } = await api.put(`/admin/offers/coupons/${id}`, dto);
  return data;
}
export async function adminDeleteCoupon(id: string): Promise<void> {
  await api.delete(`/admin/offers/coupons/${id}`);
}

// Pack Purchase Rules
export async function adminListPackRules(): Promise<PackPurchaseRule[]> {
  const { data } = await api.get('/admin/offers/pack-rules');
  return data;
}
export async function adminCreatePackRule(dto: Partial<PackPurchaseRule>): Promise<PackPurchaseRule> {
  const { data } = await api.post('/admin/offers/pack-rules', dto);
  return data;
}
export async function adminUpdatePackRule(id: string, dto: Partial<PackPurchaseRule>): Promise<PackPurchaseRule> {
  const { data } = await api.put(`/admin/offers/pack-rules/${id}`, dto);
  return data;
}
export async function adminDeletePackRule(id: string): Promise<void> {
  await api.delete(`/admin/offers/pack-rules/${id}`);
}

// Currencies
export async function adminListCurrencies(): Promise<CurrencyConfig[]> {
  const { data } = await api.get('/admin/offers/currencies');
  return data;
}
export async function adminCreateCurrency(dto: Partial<CurrencyConfig>): Promise<CurrencyConfig> {
  const { data } = await api.post('/admin/offers/currencies', dto);
  return data;
}
export async function adminUpdateCurrency(id: string, dto: Partial<CurrencyConfig & { id: string }>): Promise<CurrencyConfig> {
  const { data } = await api.put(`/admin/offers/currencies/${id}`, dto);
  return data;
}
export async function adminDeleteCurrency(id: string): Promise<void> {
  await api.delete(`/admin/offers/currencies/${id}`);
}

// Stats
export async function adminGetOffersStats(): Promise<{ activePacks: number; activeBrackets: number; activeCoupons: number; activeCurrencies: number }> {
  const { data } = await api.get('/admin/offers/stats');
  return data;
}
