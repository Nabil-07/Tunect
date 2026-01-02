// Check conversations and members
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConversations() {
  const conversations = await prisma.conversation.findMany({
    include: {
      members: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
      student: {
        select: {
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
      tutor: {
        select: {
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  console.log(`Found ${conversations.length} conversations`);
  conversations.forEach((c) => {
    console.log(`\nConversation ${c.id}:`);
    console.log(`  Type: ${c.type}`);
    console.log(`  Student: ${c.student?.user.name || c.student?.user.email}`);
    console.log(`  Tutor: ${c.tutor?.user.name || c.tutor?.user.email}`);
    console.log(`  Members: ${c.members.length}`);
    c.members.forEach((m) => {
      console.log(`    - ${m.user.name || m.user.email} (${m.role}) ${m.leftAt ? '(LEFT)' : ''}`);
    });
  });

  await prisma.$disconnect();
}

checkConversations();
