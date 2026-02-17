const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const u = await p.user.findUnique({ where: { email: "nabil.irshad@example.com" }, select: { id: true, email: true, isDirector: true, role: true } });
  console.log(u);
  await p.$disconnect();
})();
