const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const duplicates = await prisma.$queryRawUnsafe(`
      SELECT "tutorId", "bookingId", "reason", COUNT(*)::int as cnt
      FROM "TutorWalletLedger"
      WHERE "bookingId" IS NOT NULL
      GROUP BY "tutorId", "bookingId", "reason"
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 100
    `)

    console.log(`Found ${duplicates.length} duplicate groups (showing up to 100).`)
    if (duplicates.length === 0) {
      console.log('No duplicates found. Safe to add unique constraint.')
      return
    }

    console.table(duplicates)

    const totalDuplicateRows = duplicates.reduce((s, r) => s + Number(r.cnt), 0)
    console.log('Approx total duplicate rows (sum of group counts):', totalDuplicateRows)
    console.log('If you want, I can run the cleanup script to remove duplicates before adding the constraint.')
  } catch (err) {
    console.error('Error checking duplicates:', err)
    process.exit(2)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => { console.error('Unhandled error:', err); process.exit(2) })




