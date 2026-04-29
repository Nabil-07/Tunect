import { Prisma } from '@prisma/client';

/**
 * Pure helper functions for FIFO TutorTokenLot operations. All require a
 * Prisma TransactionClient and must be called inside a $transaction so that
 * lot updates, consumption rows, and wallet/student-token decrements commit
 * atomically.
 */

/**
 * Drain `qty` tokens FIFO from a (student, tutor)'s lots and write a
 * BookingLotConsumption row per lot touched (idempotent via upsert).
 * Returns the quantity-weighted average price across the consumed lots, used
 * by the caller to set Booking.priceAtBooking for display.
 */
export async function drainTutorTokenLotsForBooking(
  tx: Prisma.TransactionClient,
  args: { studentId: string; tutorId: string; bookingId: string; qty: number },
): Promise<{ consumed: number; weightedAvgPrice: number }> {
  const { studentId, tutorId, bookingId, qty } = args;
  if (!(qty > 0)) return { consumed: 0, weightedAvgPrice: 0 };

  const now = new Date();
  const lots = await tx.tutorTokenLot.findMany({
    where: {
      studentId,
      tutorId,
      remainingQty: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ purchasedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, remainingQty: true, pricePerToken: true },
  });

  let remaining = qty;
  let qtyConsumed = 0;
  let valueConsumed = 0;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const lotRemaining = Number(lot.remainingQty);
    const take = Math.min(lotRemaining, remaining);
    if (!(take > 0)) continue;

    await tx.tutorTokenLot.update({
      where: { id: lot.id },
      data: { remainingQty: { decrement: new Prisma.Decimal(take.toString()) } },
    });

    await tx.bookingLotConsumption.upsert({
      where: { bookingId_lotId: { bookingId, lotId: lot.id } },
      update: { qty: { increment: new Prisma.Decimal(take.toString()) } },
      create: {
        bookingId,
        lotId: lot.id,
        qty: new Prisma.Decimal(take.toString()),
        pricePerToken: lot.pricePerToken,
      },
    });

    qtyConsumed += take;
    valueConsumed += take * Number(lot.pricePerToken);
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Token lot pool exhausted for student ${studentId} / tutor ${tutorId} (${remaining} of ${qty} could not be drained).`,
    );
  }

  return {
    consumed: qtyConsumed,
    weightedAvgPrice: qtyConsumed > 0 ? valueConsumed / qtyConsumed : 0,
  };
}

/**
 * Restore `qty` tokens back to the originating lots for a booking (LIFO).
 * Used when a booking is refunded so the refunded tokens keep their original
 * purchase price. If the source lot is expired, mints a fresh lot at the
 * same price with a new 60-day expiry.
 */
export async function restoreTutorTokenLotsForBooking(
  tx: Prisma.TransactionClient,
  args: { bookingId: string; qty: number },
): Promise<{ restored: number }> {
  const { bookingId, qty } = args;
  if (!(qty > 0)) return { restored: 0 };

  const consumptions = await tx.bookingLotConsumption.findMany({
    where: { bookingId, reversed: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      lotId: true,
      qty: true,
      pricePerToken: true,
      lot: {
        select: { id: true, studentId: true, tutorId: true, expiresAt: true },
      },
    },
  });

  let remaining = qty;
  let restored = 0;
  const now = new Date();
  for (const c of consumptions) {
    if (remaining <= 0) break;
    const consumed = Number(c.qty);
    const take = Math.min(consumed, remaining);
    if (!(take > 0)) continue;

    const lotExpired = c.lot.expiresAt != null && c.lot.expiresAt <= now;
    if (lotExpired) {
      const fresh = new Date();
      fresh.setDate(fresh.getDate() + 60);
      await tx.tutorTokenLot.create({
        data: {
          studentId: c.lot.studentId,
          tutorId: c.lot.tutorId,
          pricePerToken: c.pricePerToken,
          initialQty: new Prisma.Decimal(take.toString()),
          remainingQty: new Prisma.Decimal(take.toString()),
          sourceLotId: c.lot.id,
          expiresAt: fresh,
        },
      });
    } else {
      await tx.tutorTokenLot.update({
        where: { id: c.lot.id },
        data: { remainingQty: { increment: new Prisma.Decimal(take.toString()) } },
      });
    }

    if (take >= consumed) {
      await tx.bookingLotConsumption.update({
        where: { id: c.id },
        data: { reversed: true },
      });
    } else {
      await tx.bookingLotConsumption.update({
        where: { id: c.id },
        data: { qty: { decrement: new Prisma.Decimal(take.toString()) } },
      });
    }

    restored += take;
    remaining -= take;
  }

  return { restored };
}

/**
 * Drain `qty` tokens FIFO without creating any BookingLotConsumption row.
 * Used for non-booking outflows: manual admin refund-out, ban forfeiture,
 * token expiry sweep. Keeps lot.remainingQty in sync with TutorTokenBalance.
 */
export async function drainLotsWithoutConsumption(
  tx: Prisma.TransactionClient,
  args: { studentId: string; tutorId: string; qty: number; expiredOnly?: boolean },
): Promise<{ drained: number }> {
  const { studentId, tutorId, qty, expiredOnly } = args;
  if (!(qty > 0)) return { drained: 0 };

  const now = new Date();
  const lots = await tx.tutorTokenLot.findMany({
    where: {
      studentId,
      tutorId,
      remainingQty: { gt: 0 },
      ...(expiredOnly
        ? { expiresAt: { lte: now } }
        : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
    },
    orderBy: [{ purchasedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, remainingQty: true },
  });

  let remaining = qty;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const lotRemaining = Number(lot.remainingQty);
    const take = Math.min(lotRemaining, remaining);
    if (!(take > 0)) continue;
    await tx.tutorTokenLot.update({
      where: { id: lot.id },
      data: { remainingQty: { decrement: new Prisma.Decimal(take.toString()) } },
    });
    remaining -= take;
  }

  return { drained: qty - remaining };
}
