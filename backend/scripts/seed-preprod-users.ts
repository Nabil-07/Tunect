import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  role: Role;
  persona: 'ADMIN' | 'TUTOR' | 'STUDENT';
};

const USERS: SeedUser[] = [
  { email: 'fauzia.tabassum@tunectnow.com', role: 'ADMIN', persona: 'ADMIN' },
  { email: 'shifa.abida@tunectnow.com', role: 'TUTOR', persona: 'TUTOR' },
  { email: 'nazmeen.rahman@tunectnow.com', role: 'STUDENT', persona: 'STUDENT' },
  { email: 'nabil.irshad@tunectnow.com', role: 'TUTOR', persona: 'TUTOR' },
];

function generatePassword(): string {
  const base = randomBytes(12).toString('base64').replace(/[+/=]/g, '');
  const symbols = '!@#$%^&*_-+?';
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const suffix = Math.floor(10 + Math.random() * 90).toString();
  return `${base}${symbol}${suffix}`;
}

async function seed() {
  const results: Array<{ email: string; password: string; role: Role }> = [];

  for (const user of USERS) {
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);

    const created = await prisma.user.upsert({
      where: { email: user.email.toLowerCase() },
      update: {
        role: user.role,
        password: hash,
        hasChosenRole: true,
      },
      create: {
        email: user.email.toLowerCase(),
        password: hash,
        role: user.role,
        hasChosenRole: true,
      },
      select: { id: true },
    });

    if (user.persona === 'STUDENT') {
      await prisma.student.upsert({
        where: { userId: created.id },
        update: {},
        create: { user: { connect: { id: created.id } }, tokens: 0 },
      });
    }

    if (user.persona === 'TUTOR') {
      await prisma.tutor.upsert({
        where: { userId: created.id },
        update: {},
        create: { user: { connect: { id: created.id } }, status: 'PENDING', hourlyRate: 0 },
      });
    }

    results.push({ email: user.email, password, role: user.role });
  }

  console.log('\n✅ Preprod users seeded/updated:');
  results.forEach((row) => {
    console.log(`- ${row.email} (${row.role}) => ${row.password}`);
  });
  console.log('\nStore these passwords securely.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });