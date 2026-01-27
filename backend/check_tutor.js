const { PrismaClient } = require('@prisma/client');

async function checkTutor() {
  const prisma = new PrismaClient();
  try {
    const tutor = await prisma.tutor.findUnique({
      where: { id: 'ff08a200-549b-4b85-8b83-26408485108d' },
      select: { id: true, tutorTid: true }
    });
    console.log('Tutor found:', tutor);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTutor();