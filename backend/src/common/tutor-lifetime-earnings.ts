import { BookingStatus } from '@prisma/client';
import { computeBookingEarnings, type ConsumptionRow } from './earnings';

/** Completed sessions and student no-shows where the tutor is paid. */
export const PAYABLE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
];

export function payableBookingWhere(tutorId: string) {
  return {
    tutorId,
    status: { in: PAYABLE_BOOKING_STATUSES },
    isDemo: false,
    tokensCharged: { gt: 0 },
  } as const;
}

export type PayableBookingForEarnings = {
  id: string;
  startTime: Date | null;
  endTime: Date | null;
  tokensCharged: number | string | { toString(): string } | null;
  priceAtBooking: number | string | { toString(): string } | null;
  lotConsumptions?: ConsumptionRow[] | null;
};

export function getBookingHours(
  startTime?: Date | null,
  endTime?: Date | null,
  tokensCharged?: number | null,
): number {
  if (startTime && endTime) {
    const ms = endTime.getTime() - startTime.getTime();
    if (ms > 0) return ms / 3_600_000;
  }
  const tokens = Number(tokensCharged ?? 0);
  return Number.isFinite(tokens) ? tokens : 0;
}

export function tutorShareForBooking(booking: PayableBookingForEarnings): number {
  const hours = getBookingHours(
    booking.startTime,
    booking.endTime,
    Number(booking.tokensCharged ?? 0),
  );
  const result = computeBookingEarnings({
    consumptions: booking.lotConsumptions,
    fallbackPriceAtBooking: Number(booking.priceAtBooking ?? 0),
    hours,
    tokensCharged: Number(booking.tokensCharged ?? 0),
  });
  return result.tutorShare > 0 ? result.tutorShare : 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumTutorShareFromBookings(
  bookings: PayableBookingForEarnings[],
  options?: { since?: Date },
): { totalEarnings: number; sessionsPaid: number } {
  let totalEarnings = 0;
  let sessionsPaid = 0;
  for (const booking of bookings) {
    const share = tutorShareForBooking(booking);
    if (share <= 0) continue;
    sessionsPaid += 1;
    if (!options?.since || (booking.endTime && booking.endTime >= options.since)) {
      totalEarnings += share;
    }
  }
  return {
    totalEarnings: roundMoney(totalEarnings),
    sessionsPaid,
  };
}
