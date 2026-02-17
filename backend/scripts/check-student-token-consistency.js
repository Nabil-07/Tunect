const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  const students = await prisma.student.findMany({
    select: {
      id: true,
      tokens: true,
      tokenLedger: {
        select: { delta: true },
      },
    },
  });

  let mismatchCount = 0;
  const mismatches = [];

  for (const student of students) {
    const net = student.tokenLedger.reduce((sum, row) => sum + Number(row.delta || 0), 0);
    const stored = Number(student.tokens || 0);

    if (Math.abs(net - stored) > 0.0001) {
      mismatchCount += 1;
      if (mismatches.length < 20) {
        mismatches.push({
          studentId: student.id,
          storedTokens: stored,
          ledgerNet: net,
          diff: net - stored,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        checked: students.length,
        mismatchCount,
        sampleMismatches: mismatches,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error('Consistency check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
