/**
 * Shared earnings calculation for completed bookings.
 *
 * Source-of-truth precedence for tutor earnings on a completed booking:
 *
 *   1. BookingLotConsumption rows (FIFO lot-based pricing).
 *      Each row has an immutable `pricePerToken` snapshot of the price the
 *      student actually paid for those tokens. Earnings sum across rows.
 *
 *   2. (Fallback) Booking.priceAtBooking × hours × (1 - fee%).
 *      Used for legacy bookings created before the lot system existed and
 *      not yet backfilled, OR when consumption rows are missing for any
 *      other reason.
 *
 * Fee tiers (per the platform's published commission schedule):
 *   • rate < 400  → 25%
 *   • 400 ≤ rate < 700 → 22%
 *   • rate ≥ 700 → 18%
 */

export function platformFeePercent(hourlyRate?: number | null): number {
  const rate = Number(hourlyRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 20;
  if (rate < 400) return 25;
  if (rate < 700) return 22;
  return 18;
}

export interface ConsumptionRow {
  qty: number | string | { toString(): string };
  pricePerToken: number | string | { toString(): string };
  reversed?: boolean;
}

export interface BookingEarningsInput {
  consumptions?: ConsumptionRow[] | null;
  /** Fallback when no consumption rows exist (legacy bookings). */
  fallbackPriceAtBooking?: number | null;
  /** Hours billed for the booking (used only by the fallback branch). */
  hours?: number | null;
  /** Tokens charged for the booking (used only by the fallback branch when hours missing). */
  tokensCharged?: number | null;
}

export interface BookingEarningsResult {
  /** Gross booking amount (before platform fee). */
  gross: number;
  /** Total platform fee charged. */
  fee: number;
  /** Net amount credited to the tutor. */
  tutorShare: number;
  /**
   * Effective rate used for display / "rate: ₹X/hr" notes. For lot-based
   * earnings this is a quantity-weighted average across consumed lots.
   */
  effectiveRate: number;
  /** True when the calculation came from BookingLotConsumption rows. */
  usedConsumptionRows: boolean;
}

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(typeof v === 'string' ? v : (v as { toString(): string }).toString());
  return Number.isFinite(n) ? n : 0;
};

export function computeBookingEarnings(input: BookingEarningsInput): BookingEarningsResult {
  const rows = (input.consumptions ?? []).filter((r) => !r.reversed);

  if (rows.length > 0) {
    let gross = 0;
    let fee = 0;
    let tutorShare = 0;
    let qtyTotal = 0;
    let valueTotal = 0;
    for (const r of rows) {
      const qty = toNum(r.qty);
      const price = toNum(r.pricePerToken);
      if (!(qty > 0) || !(price > 0)) continue;
      const lotGross = qty * price;
      const feePct = platformFeePercent(price);
      const lotFee = (lotGross * feePct) / 100;
      gross += lotGross;
      fee += lotFee;
      tutorShare += lotGross - lotFee;
      qtyTotal += qty;
      valueTotal += lotGross;
    }
    const effectiveRate = qtyTotal > 0 ? valueTotal / qtyTotal : 0;
    return {
      gross,
      fee,
      tutorShare: Math.max(0, tutorShare),
      effectiveRate,
      usedConsumptionRows: true,
    };
  }

  const price = toNum(input.fallbackPriceAtBooking);
  const hours = toNum(input.hours) || toNum(input.tokensCharged);
  if (price <= 0 || hours <= 0) {
    return { gross: 0, fee: 0, tutorShare: 0, effectiveRate: 0, usedConsumptionRows: false };
  }
  const gross = price * hours;
  const feePct = platformFeePercent(price);
  const fee = (gross * feePct) / 100;
  return {
    gross,
    fee,
    tutorShare: Math.max(0, gross - fee),
    effectiveRate: price,
    usedConsumptionRows: false,
  };
}
