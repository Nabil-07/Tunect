const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function platformFeePercent(hourlyRate) {
  const rate = Number(hourlyRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 20;
  if (rate < 400) return 25;
  if (rate < 700) return 22;
  return 18;
}

function getBookingHours(startTime, endTime, fallbackTokens) {
  if (startTime && endTime) {
    const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
    if (Number.isFinite(diffMs) && diffMs > 0) return diffMs / 3600000;
  }
  const fallback = Number(fallbackTokens ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

async function run() {
  console.log('🔧 Recalculating tutor wallet ledger amounts (BOOKING_EARNED)...');

  const entries = await prisma.tutorWalletLedger.findMany({
    where: { reason: 'BOOKING_EARNED', bookingId: { not: null } },
    select: {
      id: true,
      tutorId: true,
      bookingId: true,
      delta: true,
      booking: {
        select: {
          startTime: true,
          endTime: true,
          tokensCharged: true,
          tutor: { select: { hourlyRate: true } },
        },
      },
    },
  });

  let updated = 0;
  const affectedTutors = new Set();

  for (const entry of entries) {
    const hourlyRate = Number(entry.booking?.tutor?.hourlyRate ?? 0);
    const hours = getBookingHours(entry.booking?.startTime, entry.booking?.endTime, entry.booking?.tokensCharged);
    if (!hours || !hourlyRate) continue;

    const fee = platformFeePercent(hourlyRate);
    const expected = Math.max(0, (hours * hourlyRate * (100 - fee)) / 100);
    const expectedRounded = Math.round(expected * 100) / 100;
    const current = Number(entry.delta);

    if (Math.abs(expectedRounded - current) >= 0.01) {
      await prisma.tutorWalletLedger.update({
        where: { id: entry.id },
        data: { delta: expectedRounded },
      });
      updated += 1;
      affectedTutors.add(entry.tutorId);
    }
  }

  console.log(`✅ Updated ${updated} ledger entries.`);

  if (affectedTutors.size > 0) {
    console.log(`🧮 Recalculating wallet balances...`);
    await prisma.$executeRaw`
      UPDATE "TutorWallet" w
      SET balance = (
        SELECT COALESCE(SUM(delta), 0)
        FROM "TutorWalletLedger" l
        WHERE l."tutorId" = w."tutorId"
      )
    `;
    console.log('✅ Wallet balances recalculated.');
  } else {
    console.log('ℹ️  No tutor balances needed recalculation.');
  }

  console.log('✅ Done.');
}

run()
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
