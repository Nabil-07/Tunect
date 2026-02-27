import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tutors = await prisma.tutor.findMany({
    where: { user: { email: 'nabil.irshad@tunectnow.com' } },
    select: { id: true, userId: true },
  });
  console.log('Tutor:', JSON.stringify(tutors, null, 2));

  for (const t of tutors) {
    const docs = await prisma.kycDocument.findMany({
      where: { tutorId: t.id },
      select: { id: true, docType: true, status: true, url: true, createdAt: true },
    });
    console.log('KYC docs for tutor', t.id, ':', JSON.stringify(docs, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
