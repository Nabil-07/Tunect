const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function retroactiveBan() {
  console.log('Finding users with 3+ PII violations...\n');

  // Get all users with violations
  const violations = await prisma.piiViolationLog.groupBy({
    by: ['userId'],
    _count: { id: true },
    having: {
      id: { _count: { gte: 3 } }
    }
  });

  console.log(`Found ${violations.length} users with 3+ violations\n`);

  for (const v of violations) {
    const user = await prisma.user.findUnique({
      where: { id: v.userId },
      select: {
        id: true,
        email: true,
        isBanned: true,
        role: true,
        student: { select: { id: true, tokens: true } },
        tutor: { select: { id: true } }
      }
    });

    if (!user) {
      console.log(`⚠️  User ${v.userId} not found`);
      continue;
    }

    if (user.isBanned) {
      console.log(`ℹ️  ${user.email} - Already banned, skipping`);
      continue;
    }

    console.log(`🚫 Banning ${user.email} (${v._count.id} violations)...`);

    // Update user to banned
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isBanned: true,
        bannedScope: 'ALL',
        bannedAt: new Date()
      }
    });

    // Create ban ledger entry
    const banLedger = await prisma.banLedger.create({
      data: {
        userId: user.id,
        actorId: user.id, // Self-ban
        actorRole: 'ADMIN',
        scope: 'ALL',
        reason: 'PII_VIOLATION',
        note: `Retroactively banned - had ${v._count.id} PII violations before auto-ban was implemented`,
        isActive: true
      }
    });

    console.log(`  ✅ Created BanLedger entry: ${banLedger.id}`);

    // Forfeit tutor earnings
    if (user.role === 'TUTOR' && user.tutor) {
      const tutorWallet = await prisma.tutorWallet.findUnique({
        where: { tutorId: user.tutor.id },
        select: { balance: true }
      });

      if (tutorWallet && parseFloat(tutorWallet.balance.toString()) > 0) {
        await prisma.banForfeitureLedger.create({
          data: {
            userId: user.id,
            amount: tutorWallet.balance,
            type: 'TUTOR_EARNING_FORFEIT',
            banLedgerId: banLedger.id
          }
        });

        await prisma.tutorWallet.update({
          where: { tutorId: user.tutor.id },
          data: { balance: 0 }
        });

        await prisma.tutorWalletLedger.create({
          data: {
            tutorId: user.tutor.id,
            delta: tutorWallet.balance.mul(-1),
            reason: 'FORFEITED',
            note: `Earnings forfeited due to PII violations (Ban ID: ${banLedger.id})`
          }
        });

        console.log(`  💰 Forfeited ₹${tutorWallet.balance} in tutor earnings`);
      }
    }

    // Forfeit student tokens
    if (user.role === 'STUDENT' && user.student) {
      const tokenBalances = await prisma.tutorTokenBalance.findMany({
        where: { studentId: user.student.id },
        select: { id: true, balance: true, pricePerToken: true }
      });

      let totalForfeited = 0;
      for (const tb of tokenBalances) {
        if (parseFloat(tb.balance.toString()) > 0) {
          const amountValue = parseFloat(tb.balance.toString()) * parseFloat(tb.pricePerToken.toString());
          totalForfeited += amountValue;

          await prisma.tutorTokenBalance.update({
            where: { id: tb.id },
            data: { balance: 0 }
          });
        }
      }

      if (totalForfeited > 0) {
        await prisma.banForfeitureLedger.create({
          data: {
            userId: user.id,
            amount: totalForfeited,
            type: 'STUDENT_TOKEN_FORFEIT',
            banLedgerId: banLedger.id
          }
        });

        console.log(`  🎫 Forfeited ₹${totalForfeited} in student tokens`);
      }
    }

    console.log('');
  }

  console.log('✨ Retroactive ban process complete!');
  await prisma.$disconnect();
}

retroactiveBan().catch(console.error);
