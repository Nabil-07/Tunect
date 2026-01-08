const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  const users = await prisma.user.findMany({
    where: { email: { contains: 'nabil.irshad' } },
    select: { 
      id: true, 
      email: true, 
      isBanned: true, 
      bannedScope: true, 
      bannedAt: true,
      student: {
        select: {
          id: true,
          tokens: true
        }
      }
    }
  });

  console.log('Users found:', users.length);
  console.log(JSON.stringify(users, null, 2));

  // Check PII violations
  if (users.length > 0) {
    for (const user of users) {
      const violations = await prisma.piiViolationLog.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          createdAt: true,
          violationType: true,
          action: true
        },
        orderBy: { createdAt: 'desc' }
      });
      console.log(`\nUser: ${user.email} (${user.id})`);
      console.log(`PII Violations: ${violations.length}`);
      if (violations.length > 0) {
        console.log('Latest violations:');
        violations.slice(0, 5).forEach(v => {
          console.log(`  - ${v.createdAt.toISOString()}: ${v.violationType} (${v.action})`);
        });
      }
    }
  }

  await prisma.$disconnect();
}

checkUser().catch(console.error);
