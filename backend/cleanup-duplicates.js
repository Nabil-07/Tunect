const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runCleanup() {
  try {
    console.log('🧹 Starting Tutor Wallet Ledger Cleanup...\n');

    // Step 1: Identify duplicates
    console.log('📋 Step 1: Identifying duplicate ledger entries...');
    const duplicates = await prisma.$queryRaw`
      SELECT 
        "tutorId", 
        "bookingId", 
        reason, 
        COUNT(*) as count,
        MIN("createdAt") as first_created,
        MAX("createdAt") as last_created,
        SUM(delta) as total_amount
      FROM "TutorWalletLedger"
      WHERE "bookingId" IS NOT NULL 
        AND reason = 'BOOKING_EARNED'
      GROUP BY "tutorId", "bookingId", reason
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length > 0) {
      console.log(`✅ Found ${duplicates.length} bookings with duplicate entries:\n`);
      duplicates.forEach(dup => {
        console.log(`  • Booking ${dup.bookingId}: ${dup.count} entries (total: ₹${dup.total_amount})`);
      });
    } else {
      console.log('✅ No duplicate entries found!\n');
      return;
    }

    // Step 2: Remove duplicates
    console.log('\n🗑️  Step 2: Removing duplicate entries...');
    const deleteResult = await prisma.$executeRaw`
      WITH duplicates AS (
        SELECT 
          id,
          ROW_NUMBER() OVER (PARTITION BY "tutorId", "bookingId", reason ORDER BY "createdAt" ASC) as rn
        FROM "TutorWalletLedger"
        WHERE "bookingId" IS NOT NULL 
          AND reason = 'BOOKING_EARNED'
      )
      DELETE FROM "TutorWalletLedger"
      WHERE id IN (
        SELECT id FROM duplicates WHERE rn > 1
      )
    `;
    
    console.log(`✅ Deleted ${deleteResult} duplicate entries\n`);

    // Step 3: Recalculate wallet balances
    console.log('💰 Step 3: Recalculating wallet balances...');
    
    const ledgerSums = await prisma.$queryRaw`
      SELECT 
        "tutorId",
        SUM(CASE WHEN reason = 'BOOKING_EARNED' THEN delta ELSE 0 END) as earned,
        SUM(CASE WHEN reason = 'PAYOUT' THEN delta ELSE 0 END) as paid_out,
        SUM(CASE WHEN reason = 'ADJUSTMENT' THEN delta ELSE 0 END) as adjustments,
        SUM(delta) as total_balance
      FROM "TutorWalletLedger"
      GROUP BY "tutorId"
    `;

    const updateResult = await prisma.$executeRaw`
      UPDATE "TutorWallet" w
      SET balance = (
        SELECT COALESCE(SUM(delta), 0)
        FROM "TutorWalletLedger" l
        WHERE l."tutorId" = w."tutorId"
      )
      WHERE "tutorId" IN (
        SELECT "tutorId" FROM "TutorWalletLedger" GROUP BY "tutorId"
      )
    `;
    
    console.log(`✅ Updated ${updateResult} wallet balances\n`);

    // Step 4: Verify correctness
    console.log('🔍 Step 4: Verifying wallet accuracy...');
    const mismatches = await prisma.$queryRaw`
      SELECT 
        w."tutorId",
        w.balance as wallet_balance,
        COALESCE(SUM(l.delta), 0)::DECIMAL as ledger_sum,
        (w.balance - COALESCE(SUM(l.delta), 0))::DECIMAL as difference
      FROM "TutorWallet" w
      LEFT JOIN "TutorWalletLedger" l ON w."tutorId" = l."tutorId"
      GROUP BY w."tutorId", w.balance
      HAVING w.balance != COALESCE(SUM(l.delta), 0)
    `;

    if (mismatches.length === 0) {
      console.log('✅ All wallet balances are now correct!\n');
      
      console.log('📊 Summary:');
      console.log(`  • Duplicate entries removed: ${deleteResult}`);
      console.log(`  • Wallet balances recalculated: ${updateResult}`);
      console.log(`  • Verification: ✅ PASSED\n`);
    } else {
      console.log('⚠️  WARNING: Some wallets still have mismatches:\n');
      mismatches.forEach(mismatch => {
        console.log(`  • Tutor ${mismatch.tutorId}: wallet=${mismatch.wallet_balance}, ledger=${mismatch.ledger_sum}, diff=${mismatch.difference}`);
      });
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runCleanup();
