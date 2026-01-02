// Script to create conversations for existing bookings
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createConversationsForExistingBookings() {
  console.log('🔍 Finding bookings without conversations...');
  
  // Get all bookings that don't have conversations yet
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'COMPLETED', 'PENDING'] },
      conversations: {
        none: {},
      },
    },
    include: {
      student: {
        select: {
          id: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
      tutor: {
        select: {
          id: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  console.log(`📊 Found ${bookings.length} bookings without conversations`);

  for (const booking of bookings) {
    try {
      // Check if conversation already exists for this student-tutor pair
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          type: booking.isGroupSession ? 'GROUP_SESSION' : 'DIRECT',
          referenceId: booking.id,
        },
      });

      if (existingConversation) {
        console.log(`✅ Conversation already exists for booking ${booking.id}`);
        continue;
      }

      // Create conversation
      const conversation = await prisma.conversation.create({
        data: {
          type: booking.isGroupSession ? 'GROUP_SESSION' : 'DIRECT',
          referenceId: booking.id,
          isActive: true,
          studentId: booking.studentId,
          tutorId: booking.tutorId,
          members: {
            create: [
              {
                userId: booking.student.userId,
                role: 'MEMBER',
              },
              {
                userId: booking.tutor.userId,
                role: 'MEMBER',
              },
            ],
          },
        },
      });

      console.log(`✨ Created ${conversation.type} conversation ${conversation.id} for booking ${booking.id}`);
      console.log(`   Student: ${booking.student.user.name || booking.student.user.email}`);
      console.log(`   Tutor: ${booking.tutor.user.name || booking.tutor.user.email}`);
    } catch (error) {
      console.error(`❌ Error creating conversation for booking ${booking.id}:`, error.message);
    }
  }

  console.log('✅ Done!');
}

createConversationsForExistingBookings()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
