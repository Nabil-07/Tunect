const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Debugging Token Balance Issue ===\n');

  // Get the student
  const student = await prisma.student.findFirst({
    where: {
      user: {
        email: {
          contains: 'nabil', // Assuming user's email has "nabil"
        },
      },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!student) {
    console.log('Student not found');
    return;
  }

  console.log('Student:', {
    id: student.id,
    userId: student.userId,
    email: student.user.email,
    name: student.user.name,
    overallTokens: student.tokens,
  });

  // Get all token balances for this student
  const tokenBalances = await prisma.tutorTokenBalance.findMany({
    where: { studentId: student.id },
    include: {
      tutor: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  console.log('\n=== Token Balances ===');
  tokenBalances.forEach((tb) => {
    console.log({
      studentId: tb.studentId,
      tutorId: tb.tutorId,
      tutorName: tb.tutor.user.name,
      balance: tb.balance.toString(),
    });
  });

  // Get the conversation with "Chuckle Cuts"
  const conversation = await prisma.conversation.findFirst({
    where: {
      studentId: student.id,
      tutor: {
        user: {
          name: {
            contains: 'Chuckle',
          },
        },
      },
    },
    include: {
      student: { select: { id: true, userId: true } },
      tutor: { 
        select: { 
          id: true, 
          userId: true,
          user: { select: { name: true, email: true } }
        } 
      },
    },
  });

  console.log('\n=== Chuckle Cuts Conversation ===');
  if (conversation) {
    console.log({
      conversationId: conversation.id,
      studentId: conversation.student.id,
      tutorId: conversation.tutor.id,
      tutorName: conversation.tutor.user.name,
    });

    // Check if there's a token balance for this exact student-tutor pair
    const balance = await prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId: conversation.student.id,
          tutorId: conversation.tutor.id,
        },
      },
    });

    console.log('\nToken balance for this student-tutor pair:');
    if (balance) {
      console.log({
        found: true,
        balance: balance.balance.toString(),
        hasTokens: Number(balance.balance) > 0,
      });
    } else {
      console.log({ found: false });
    }
  } else {
    console.log('Conversation not found');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
