const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRESERVED_TABLES = new Set(['_prisma_migrations', 'User', 'Student', 'Tutor']);

async function getUserRoleSummary() {
  const rows = await prisma.user.groupBy({
    by: ['role'],
    _count: { _all: true },
  });

  return rows.reduce((acc, row) => {
    const key = row.role ?? 'UNSET';
    acc[key] = row._count._all;
    return acc;
  }, {});
}

async function getCountsSnapshot() {
  const [
    users,
    students,
    tutors,
    bookings,
    tokenLedger,
    tutorTokenBalance,
    payments,
    conversations,
    messages,
    reviews,
    tutorWallet,
    tutorWalletLedger,
    payouts,
    oauthAccounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.student.count(),
    prisma.tutor.count(),
    prisma.booking.count(),
    prisma.tokenLedger.count(),
    prisma.tutorTokenBalance.count(),
    prisma.payment.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.review.count(),
    prisma.tutorWallet.count(),
    prisma.tutorWalletLedger.count(),
    prisma.payout.count(),
    prisma.oAuthAccount.count(),
  ]);

  return {
    users,
    students,
    tutors,
    bookings,
    tokenLedger,
    tutorTokenBalance,
    payments,
    conversations,
    messages,
    reviews,
    tutorWallet,
    tutorWalletLedger,
    payouts,
    oauthAccounts,
  };
}

async function getTruncationTargets() {
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> ALL(ARRAY['${'_prisma_migrations'}'])
    ORDER BY tablename ASC
  `;

  return tables
    .map((row) => row.tablename)
    .filter((tableName) => !PRESERVED_TABLES.has(tableName));
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function run() {
  const apply = process.argv.includes('--apply');

  console.log('============================================');
  console.log('Account-only DB cleanup');
  console.log('Mode:', apply ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)');
  console.log('Preserved tables:', [...PRESERVED_TABLES].join(', '));
  console.log('============================================\n');

  const beforeCounts = await getCountsSnapshot();
  const beforeRoles = await getUserRoleSummary();
  const truncationTargets = await getTruncationTargets();

  console.log('Before counts:', JSON.stringify(beforeCounts, null, 2));
  console.log('User roles:', JSON.stringify(beforeRoles, null, 2));
  console.log('Tables to truncate:', truncationTargets.length);

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to execute cleanup.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (truncationTargets.length > 0) {
      const truncateSql = `TRUNCATE TABLE ${truncationTargets
        .map(quoteIdent)
        .join(', ')} RESTART IDENTITY CASCADE`;
      await tx.$executeRawUnsafe(truncateSql);
    }

    await tx.$executeRawUnsafe(`
      UPDATE "User"
      SET
        "avatarUrl" = NULL,
        "phone" = NULL,
        "isDirector" = FALSE,
        "isBanned" = FALSE,
        "bannedScope" = NULL,
        "bannedAt" = NULL,
        "preferredCurrency" = 'INR',
        "failedLoginAttempts" = 0,
        "lockUntil" = NULL,
        "hasChosenRole" = CASE WHEN "role" IS NULL THEN FALSE ELSE TRUE END,
        "updatedAt" = NOW()
    `);

    await tx.$executeRawUnsafe(`
      DELETE FROM "Student" s
      USING "User" u
      WHERE s."userId" = u."id"
        AND u."role" <> 'STUDENT'
    `);

    await tx.$executeRawUnsafe(`
      DELETE FROM "Tutor" t
      USING "User" u
      WHERE t."userId" = u."id"
        AND u."role" <> 'TUTOR'
    `);

    await tx.$executeRawUnsafe(`
      UPDATE "Student"
      SET
        "grade" = NULL,
        "tokens" = 0,
        "bio" = NULL,
        "timezone" = NULL,
        "preferredLanguage" = NULL,
        "student_sid" = NULL,
        "updatedAt" = NOW()
    `);

    await tx.$executeRawUnsafe(`
      UPDATE "Tutor"
      SET
        "bio" = NULL,
        "summary" = NULL,
        "subjects" = ARRAY[]::TEXT[],
        "languages" = ARRAY[]::TEXT[],
        "degrees" = ARRAY[]::TEXT[],
        "classesTeach" = ARRAY[]::TEXT[],
        "qualifications" = NULL,
        "yearsExperience" = NULL,
        "hourlyRate" = 0,
        "status" = 'PENDING',
        "country" = NULL,
        "isTrending" = FALSE,
        "tutor_tid" = NULL,
        "demeritPoints" = 0,
        "lastDemeritReset" = NULL,
        "lastActiveDate" = NULL,
        "availabilityConsistency" = NULL,
        "isFeatured" = FALSE,
        "isVerified" = FALSE,
        "weeklyAvailabilityHours" = NULL,
        "lastAvailabilityUpdate" = NULL,
        "isAutoSuspended" = FALSE,
        "noShowCount" = 0,
        "updatedAt" = NOW()
    `);
  });

  const afterCounts = await getCountsSnapshot();
  const afterRoles = await getUserRoleSummary();

  console.log('\nCleanup completed successfully.');
  console.log('After counts:', JSON.stringify(afterCounts, null, 2));
  console.log('User roles after cleanup:', JSON.stringify(afterRoles, null, 2));
}

run()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
