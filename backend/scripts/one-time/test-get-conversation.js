const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testGetConversation() {
  const conversationId = 'cmjx0tbcb000bhxds2iaccbsi';
  const userId = 'cmjpnroq00000hxk8xq84wvk7'; // Student user ID

  console.log('=== Testing getConversation Logic ===\n');

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  console.log('User role:', user.role);

  // Get conversation
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      student: { select: { id: true, userId: true, user: { select: { name: true, email: true } } } },
      tutor: { select: { id: true, userId: true, user: { select: { name: true, email: true } } } },
      members: {
        where: { leftAt: null },
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true },
          },
        },
      },
    },
  });

  console.log('\nConversation details:');
  console.log({
    id: conversation.id,
    type: conversation.type,
    studentId: conversation.student?.id,
    tutorId: conversation.tutor?.id,
    tutorName: conversation.tutor?.user.name,
  });

  // Check if user is member
  const isMember = conversation.members.some((m) => m.userId === userId);
  console.log('\nIs member:', isMember);

  // Determine tutorId for token check
  let tutorId = null;
  if (conversation.student?.userId === userId && conversation.tutor) {
    tutorId = conversation.tutor.id;
    console.log('Current user is student, checking tokens with tutor:', tutorId);
  } else if (conversation.tutor?.userId === userId && conversation.student) {
    console.log('Current user is tutor, no token check needed');
  }

  // Check token balance
  if (tutorId) {
    const userWithStudent = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true },
    });

    if (userWithStudent?.student) {
      const tutorBalance = await prisma.tutorTokenBalance.findUnique({
        where: {
          studentId_tutorId: {
            studentId: userWithStudent.student.id,
            tutorId: tutorId,
          },
        },
      });

      console.log('\nToken balance query result:');
      if (tutorBalance) {
        console.log({
          found: true,
          studentId: userWithStudent.student.id,
          tutorId: tutorId,
          balance: tutorBalance.balance.toString(),
          hasTokens: Number(tutorBalance.balance) > 0,
        });
      } else {
        console.log({ found: false });
      }
    }
  }
}

testGetConversation()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
