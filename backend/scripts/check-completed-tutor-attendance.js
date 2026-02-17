const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseAttendance(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const attendance = data.attendance;
  if (!attendance || typeof attendance !== 'object' || Array.isArray(attendance)) return {};
  return {
    studentJoinedAt:
      typeof attendance.studentJoinedAt === 'string' ? attendance.studentJoinedAt : undefined,
    tutorJoinedAt:
      typeof attendance.tutorJoinedAt === 'string' ? attendance.tutorJoinedAt : undefined,
  };
}

async function run() {
  const completed = await prisma.booking.findMany({
    where: { status: 'COMPLETED' },
    select: {
      id: true,
      whiteboardSessions: { select: { data: true }, take: 1 },
    },
  });

  let tutorJoined = 0;
  let tutorNotJoined = 0;

  for (const booking of completed) {
    const data = booking.whiteboardSessions?.[0]?.data;
    const attendance = parseAttendance(data);
    if (attendance.tutorJoinedAt) tutorJoined += 1;
    else tutorNotJoined += 1;
  }

  console.log(
    JSON.stringify(
      {
        completedTotal: completed.length,
        completedWithTutorJoined: tutorJoined,
        completedWithoutTutorJoined: tutorNotJoined,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error('Check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
