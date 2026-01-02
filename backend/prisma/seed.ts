// prisma/seed.ts
import { PrismaClient, TutorStatus, Role, BookingStatus, PaymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Helper arrays for generating realistic dummy data
const firstNames = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Ananya', 'Arjun', 'Kavya', 'Rohan', 'Ishita', 'Aditya', 'Meera', 'Karan', 'Diya', 'Siddharth', 'Nisha', 'Ravi', 'Pooja', 'Manish', 'Riya'];
const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Verma', 'Reddy', 'Nair', 'Joshi', 'Iyer', 'Khan', 'Kapoor', 'Mehta', 'Chopra', 'Desai', 'Malhotra', 'Agarwal', 'Bansal', 'Jain', 'Saxena'];
const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Hindi', 'Computer Science', 'Data Structures', 'Python', 'Java', 'Web Development', 'IELTS', 'SAT', 'JEE', 'NEET', 'Economics', 'Accounting', 'Business Studies'];
const countries = ['India', 'UAE', 'USA', 'UK', 'Canada', 'Australia', 'Singapore'];
const grades = ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Undergraduate', 'Graduate'];
const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Dubai', 'London', 'New York', 'Toronto'];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomElements<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding...\n');
  
  const hashedPassword = await bcrypt.hash('Test@1234', 10);

  // --- STEP 1: Create Admin User ---
  console.log('📝 Creating admin user...');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@tunect.com' },
    update: { 
      password: hashedPassword, 
      role: Role.ADMIN,
      name: 'Admin User',
      hasChosenRole: true,
    },
    create: { 
      email: 'admin@tunect.com', 
      password: hashedPassword, 
      role: Role.ADMIN,
      name: 'Admin User',
      hasChosenRole: true,
    },
  });
  console.log(`✅ Admin created: ${admin.email}\n`);

  // --- STEP 2: Create 40 Tutors ---
  console.log('👨‍🏫 Creating 40 tutors...');
  const tutors = [];
  for (let i = 0; i < 40; i++) {
    const firstName = getRandomElement(firstNames);
    const lastName = getRandomElement(lastNames);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.tutor${i}@tunect.com`;
    
    const tutorUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: Role.TUTOR,
        name: `${firstName} ${lastName}`,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        hasChosenRole: true,
        phone: `+91${getRandomInt(7000000000, 9999999999)}`,
      },
    });

    const tutor = await prisma.tutor.create({
      data: {
        userId: tutorUser.id,
        status: i < 35 ? TutorStatus.APPROVED : TutorStatus.PENDING, // 35 approved, 5 pending
        hourlyRate: getRandomInt(500, 2000),
        bio: `Experienced ${getRandomElements(subjects, 2).join(' & ')} tutor with ${getRandomInt(2, 15)} years of experience. Specialized in helping students excel in their academics.`,
        subjects: getRandomElements(subjects, getRandomInt(2, 5)),
        isTrending: i < 8, // First 8 are trending
        country: getRandomElement(countries),
      },
    });

    tutors.push({ user: tutorUser, tutor });
  }
  console.log(`✅ Created ${tutors.length} tutors\n`);

  // --- STEP 3: Create 80 Students ---
  console.log('👨‍🎓 Creating 80 students...');
  const students = [];
  for (let i = 0; i < 80; i++) {
    const firstName = getRandomElement(firstNames);
    const lastName = getRandomElement(lastNames);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.student${i}@tunect.com`;
    
    const studentUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: Role.STUDENT,
        name: `${firstName} ${lastName}`,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        hasChosenRole: true,
        phone: `+91${getRandomInt(7000000000, 9999999999)}`,
      },
    });

    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        tokens: getRandomInt(0, 500),
        grade: getRandomElement(grades),
      },
    });

    students.push({ user: studentUser, student });
  }
  console.log(`✅ Created ${students.length} students\n`);

  // --- STEP 4: Create Availability Slots for Tutors ---
  console.log('📅 Creating availability slots...');
  let slotCount = 0;
  const approvedTutors = tutors.filter(t => t.tutor.status === TutorStatus.APPROVED);
  
  for (const { tutor } of approvedTutors) {
    // Create 3-7 slots per tutor
    const numSlots = getRandomInt(3, 7);
    for (let i = 0; i < numSlots; i++) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + getRandomInt(1, 30));
      startDate.setHours(getRandomInt(9, 18), 0, 0, 0);
      
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + getRandomInt(1, 3));

      await prisma.availabilitySlot.create({
        data: {
          tutorId: tutor.id,
          startTime: startDate,
          endTime: endDate,
          title: `Available for ${getRandomElement(tutor.subjects || [])}`,
        },
      });
      slotCount++;
    }
  }
  console.log(`✅ Created ${slotCount} availability slots\n`);

  // --- STEP 5: Create Bookings ---
  console.log('📚 Creating bookings...');
  const bookings = [];
  const statuses = [BookingStatus.COMPLETED, BookingStatus.CONFIRMED, BookingStatus.PENDING, BookingStatus.CANCELED];
  
  // Create 60 bookings
  for (let i = 0; i < 60; i++) {
    const tutor = getRandomElement(approvedTutors).tutor;
    const { student } = getRandomElement(students);
    const status = getRandomElement(statuses);
    
    const startTime = getRandomDate(
      new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)  // 30 days future
    );
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour session
    
    const booking = await prisma.booking.create({
      data: {
        tutorId: tutor.id,
        studentId: student.id,
        startTime,
        endTime,
        status,
        notes: `Session for ${getRandomElement(tutor.subjects || ['Math'])}`,
        isDemo: Math.random() > 0.8, // 20% are demo sessions
        tokensCharged: tutor.hourlyRate,
      },
    });
    
    bookings.push(booking);
  }
  console.log(`✅ Created ${bookings.length} bookings\n`);

  // --- STEP 6: Create Reviews for Completed Bookings ---
  console.log('⭐ Creating reviews...');
  const completedBookings = bookings.filter(b => b.status === BookingStatus.COMPLETED);
  let reviewCount = 0;
  
  for (const booking of completedBookings.slice(0, 30)) { // Create reviews for 30 completed bookings
    await prisma.review.create({
      data: {
        bookingId: booking.id,
        tutorId: booking.tutorId,
        studentId: booking.studentId,
        rating: getRandomInt(3, 5),
        comment: getRandomElement([
          'Excellent tutor! Very patient and knowledgeable.',
          'Great session, learned a lot!',
          'Highly recommended. Clear explanations.',
          'Very helpful and friendly.',
          'Good teaching style, will book again.',
          'Awesome experience!',
        ]),
      },
    });
    reviewCount++;
  }
  console.log(`✅ Created ${reviewCount} reviews\n`);

  // --- STEP 7: Create Payments ---
  console.log('💳 Creating payments...');
  let paymentCount = 0;
  
  for (let i = 0; i < 50; i++) {
    const { user: studentUser } = getRandomElement(students);
    const tokensPurchased = getRandomInt(10, 100);
    const amountInMinor = tokensPurchased * 100; // 1 token = ₹1
    
    await prisma.payment.create({
      data: {
        userId: studentUser.id,
        amountInMinor,
        currency: 'INR',
        status: Math.random() > 0.1 ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
        tokensPurchased,
        provider: 'RAZORPAY',
        providerOrderId: `order_${Math.random().toString(36).substr(2, 9)}`,
        providerPaymentId: `pay_${Math.random().toString(36).substr(2, 9)}`,
      },
    });
    paymentCount++;
  }
  console.log(`✅ Created ${paymentCount} payments\n`);

  // --- STEP 8: Create Conversations and Messages ---
  console.log('💬 Creating conversations and messages...');
  let conversationCount = 0;
  let messageCount = 0;
  
  for (let i = 0; i < 40; i++) {
    const tutor = getRandomElement(approvedTutors).tutor;
    const { student, user: studentUser } = getRandomElement(students);
    const tutorUser = tutors.find(t => t.tutor.id === tutor.id)?.user;
    
    if (!tutorUser) continue;
    
    const conversation = await prisma.conversation.create({
      data: {
        tutorId: tutor.id,
        studentId: student.id,
        bookingId: bookings[i]?.id || null,
      },
    });
    conversationCount++;
    
    // Create 3-10 messages per conversation
    const numMessages = getRandomInt(3, 10);
    for (let j = 0; j < numMessages; j++) {
      const isFromStudent = j % 2 === 0;
      const messageText = getRandomElement([
        'Hi, I need help with calculus.',
        'Sure, when would you like to schedule a session?',
        'How about tomorrow at 3 PM?',
        'That works for me!',
        'Great! See you then.',
        'Can you help me with derivatives?',
        'Of course! I specialize in that.',
        'Thank you so much!',
        'What topics should I prepare?',
        'Let me know if you have any questions.',
      ]);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: isFromStudent ? studentUser.id : tutorUser.id,
          text: messageText,
          content: messageText,
        },
      });
      messageCount++;
    }
  }
  console.log(`✅ Created ${conversationCount} conversations with ${messageCount} messages\n`);

  // --- STEP 9: Create Token Ledger Entries ---
  console.log('🪙 Creating token ledger entries...');
  let ledgerCount = 0;
  
  for (const booking of bookings) {
    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CONFIRMED) {
      await prisma.tokenLedger.create({
        data: {
          studentId: booking.studentId,
          tutorId: booking.tutorId,
          delta: -booking.tokensCharged,
          reason: 'BOOKING',
          bookingId: booking.id,
        },
      });
      ledgerCount++;
    }
  }
  console.log(`✅ Created ${ledgerCount} token ledger entries\n`);

  // --- SUMMARY ---
  console.log('\n🎉 Database seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   👤 Users: ${1 + tutors.length + students.length} (1 admin, ${tutors.length} tutors, ${students.length} students)`);
  console.log(`   👨‍🏫 Tutors: ${tutors.length} (${approvedTutors.length} approved, ${tutors.length - approvedTutors.length} pending)`);
  console.log(`   👨‍🎓 Students: ${students.length}`);
  console.log(`   📅 Availability Slots: ${slotCount}`);
  console.log(`   📚 Bookings: ${bookings.length}`);
  console.log(`   ⭐ Reviews: ${reviewCount}`);
  console.log(`   💳 Payments: ${paymentCount}`);
  console.log(`   💬 Conversations: ${conversationCount}`);
  console.log(`   📧 Messages: ${messageCount}`);
  console.log(`   🪙 Token Ledger: ${ledgerCount}`);
  console.log(`\n   📈 Total Records: ~${1 + tutors.length + students.length + slotCount + bookings.length + reviewCount + paymentCount + conversationCount + messageCount + ledgerCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
