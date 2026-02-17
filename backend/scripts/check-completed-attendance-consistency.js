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
      whiteboardSessions: {
        take: 1,
        select: { data: true },
      },
    },
  });

  let bothVerified = 0;
  let onlyOneOrNone = 0;

  for (const booking of completed) {
    const data = booking.whiteboardSessions?.[0]?.data;
    const attendance = parseAttendance(data);
    const hasBoth = !!attendance.studentJoinedAt && !!attendance.tutorJoinedAt;
    if (hasBoth) bothVerified += 1;
    else onlyOneOrNone += 1;
  }

  console.log(
    JSON.stringify(
      {
        completedTotal: completed.length,
        completedWithBothAttendance: bothVerified,
        completedWithoutBothAttendance: onlyOneOrNone,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error('Attendance consistency check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
