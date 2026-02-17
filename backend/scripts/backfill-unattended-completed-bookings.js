const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

const MARKER = 'AUTO_BACKFILL_UNATTENDED_COMPLETED_V1';

function parseAttendance(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const attendance = data.attendance;
  if (!attendance || typeof attendance !== 'object' || Array.isArray(attendance)) return {};
  return {
    studentJoinedAt:
      typeof attendance.studentJoinedAt === 'string' ? attendance.studentJoinedAt : undefined,
    tutorJoinedAt:
      typeof attendance.tutorJoinedAt === 'string' ? attendance.tutorJoinedAt : undefined,
  };
}

function classifyStatus(attendance) {
  const studentJoined = !!attendance.studentJoinedAt;
  const tutorJoined = !!attendance.tutorJoinedAt;

  if (!studentJoined && !tutorJoined) return 'CANCELED';
  if (!studentJoined && tutorJoined) return 'AUTO_CANCELLED_STUDENT_NO_SHOW';
  if (studentJoined && !tutorJoined) return 'AUTO_CANCELLED_TUTOR_NO_SHOW';
  return null;
}

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function run() {
  const apply = process.argv.includes('--apply');

  console.log('========================================');
  console.log('Backfill unattended completed bookings');
  console.log('Marker:', MARKER);
  console.log('Mode:', apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)');
  console.log('========================================\n');

  const completed = await prisma.booking.findMany({
    where: { status: 'COMPLETED' },
    select: {
      id: true,
      status: true,
      tutorId: true,
      whiteboardSessions: {
        take: 1,
        select: { data: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let examined = 0;
  let toStatusFix = 0;
  let statusFixed = 0;
  let toReverseLedgerRows = 0;
  let reversedLedgerRows = 0;
  let alreadyReversedRows = 0;
  let reversalAmountTotal = 0;
  let failed = 0;

  for (const booking of completed) {
    examined += 1;

    const attendance = parseAttendance(booking.whiteboardSessions?.[0]?.data);
    const targetStatus = classifyStatus(attendance);
    if (!targetStatus) continue;

    toStatusFix += 1;

    const earnedRows = await prisma.tutorWalletLedger.findMany({
      where: {
        bookingId: booking.id,
        reason: 'BOOKING_EARNED',
        delta: { gt: new Prisma.Decimal(0) },
      },
      select: {
        id: true,
        tutorId: true,
        delta: true,
      },
    });

    toReverseLedgerRows += earnedRows.length;

    if (!apply) {
      reversalAmountTotal += earnedRows.reduce((sum, row) => sum + toNumber(row.delta), 0);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: targetStatus },
        });

        for (const row of earnedRows) {
          const markerPrefix = `${MARKER}:sourceLedger=${row.id}`;

          const existingReverse = await tx.tutorWalletLedger.findFirst({
            where: {
              tutorId: row.tutorId,
              reason: 'ADJUSTMENT',
              note: { startsWith: markerPrefix },
            },
            select: { id: true },
          });

          if (existingReverse) {
            alreadyReversedRows += 1;
            continue;
          }

          const amount = toNumber(row.delta);
          if (amount <= 0) continue;

          await tx.tutorWalletLedger.create({
            data: {
              tutorId: row.tutorId,
              bookingId: null,
              delta: new Prisma.Decimal(-amount),
              reason: 'ADJUSTMENT',
              note: `${markerPrefix};bookingId=${booking.id};statusFix=${targetStatus}`,
            },
          });

          await tx.tutorWallet.upsert({
            where: { tutorId: row.tutorId },
            update: { balance: { decrement: amount } },
            create: { tutorId: row.tutorId, balance: new Prisma.Decimal(-amount) },
          });

          reversedLedgerRows += 1;
          reversalAmountTotal += amount;
        }
      });

      statusFixed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed processing booking ${booking.id}:`, error?.message || error);
    }
  }

  console.log('\n----------- Summary -----------');
  console.log('Completed bookings examined:', examined);
  console.log('Bookings needing status fix:', toStatusFix);
  console.log('Ledger rows to reverse:', toReverseLedgerRows);

  if (apply) {
    console.log('Bookings status fixed:', statusFixed);
    console.log('Ledger rows reversed:', reversedLedgerRows);
    console.log('Already reversed rows:', alreadyReversedRows);
    console.log('Total reversal amount:', reversalAmountTotal.toFixed(2));
    console.log('Failed bookings:', failed);
  } else {
    console.log('Estimated reversal amount:', reversalAmountTotal.toFixed(2));
    console.log('No database writes in dry-run mode.');
    console.log('Run with --apply to execute backfill.');
  }

  console.log('-------------------------------');
}

run()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
