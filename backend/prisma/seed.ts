// prisma/seed.ts
import { PrismaClient, TutorStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('Test@1234', 10);

  // --- base users ---
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { password: hashedPassword, role: Role.ADMIN },
    create: { email: 'admin@example.com', password: hashedPassword, role: Role.ADMIN },
  });

  const tutorUser = await prisma.user.upsert({
    where: { email: 'tutor@example.com' },
    update: { password: hashedPassword, role: Role.TUTOR },
    create: { email: 'tutor@example.com', password: hashedPassword, role: Role.TUTOR },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@example.com' },
    update: { password: hashedPassword, role: Role.STUDENT },
    create: { email: 'student@example.com', password: hashedPassword, role: Role.STUDENT },
  });

  // --- main tutor profile (trending) ---
  await prisma.tutor.upsert({
    where: { userId: tutorUser.id },
    update: {
      status: TutorStatus.APPROVED,
      hourlyRate: 800,
      bio: 'Math tutor',
      subjects: ['Math', 'Physics'],
      isTrending: true,
      country: 'India',
    },
    create: {
      user: { connect: { id: tutorUser.id } }, // ✅ relation connect
      status: TutorStatus.APPROVED,
      hourlyRate: 800,
      bio: 'Math tutor',
      subjects: ['Math', 'Physics'],
      isTrending: true,
      country: 'India',
    },
  });

  // --- extra tutors for carousel variety ---
  const rajeshUser = await prisma.user.upsert({
    where: { email: 'rajesh@example.com' },
    update: {
      password: hashedPassword,
      role: Role.TUTOR,
      name: 'Rajesh Kumar',
      avatarUrl: 'https://picsum.photos/seed/rajesh/300',
    },
    create: {
      email: 'rajesh@example.com',
      password: hashedPassword,
      role: Role.TUTOR,
      name: 'Rajesh Kumar',
      avatarUrl: 'https://picsum.photos/seed/rajesh/300',
    },
  });

  await prisma.tutor.upsert({
    where: { userId: rajeshUser.id },
    update: {
      status: TutorStatus.APPROVED,
      hourlyRate: 1000,
      bio: 'Python & Data Structures mentor',
      subjects: ['Python', 'DSA'],
      isTrending: true,
      country: 'India',
    },
    create: {
      user: { connect: { id: rajeshUser.id } }, // ✅ relation connect
      status: TutorStatus.APPROVED,
      hourlyRate: 1000,
      bio: 'Python & Data Structures mentor',
      subjects: ['Python', 'DSA'],
      isTrending: true,
      country: 'India',
    },
  });

  const ayeshaUser = await prisma.user.upsert({
    where: { email: 'ayesha@example.com' },
    update: {
      password: hashedPassword,
      role: Role.TUTOR,
      name: 'Ayesha Khan',
      avatarUrl: 'https://picsum.photos/seed/ayesha/300',
    },
    create: {
      email: 'ayesha@example.com',
      password: hashedPassword,
      role: Role.TUTOR,
      name: 'Ayesha Khan',
      avatarUrl: 'https://picsum.photos/seed/ayesha/300',
    },
  });

  await prisma.tutor.upsert({
    where: { userId: ayeshaUser.id },
    update: {
      status: TutorStatus.APPROVED,
      hourlyRate: 1200,
      bio: 'IELTS & Spoken English trainer',
      subjects: ['English', 'IELTS'],
      isTrending: true,
      country: 'UAE',
    },
    create: {
      user: { connect: { id: ayeshaUser.id } }, // ✅ relation connect
      status: TutorStatus.APPROVED,
      hourlyRate: 1200,
      bio: 'IELTS & Spoken English trainer',
      subjects: ['English', 'IELTS'],
      isTrending: true,
      country: 'UAE',
    },
  });

  // --- student profile ---
  await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: { tokens: 100, grade: 'Grade 10' },
    create: {
      user: { connect: { id: studentUser.id } }, // ✅ relation connect
      tokens: 100,
      grade: 'Grade 10',
    },
  });

  console.log('Seeded/updated:', {
    admin: admin.email,
    tutor: tutorUser.email,
    student: studentUser.email,
    extras: ['rajesh@example.com', 'ayesha@example.com'],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
