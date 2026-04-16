"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const dryRun = !process.argv.includes('--apply');
async function main() {
    if (dryRun)
        console.log('=== DRY RUN (pass --apply to execute) ===\n');
    const tutorsWithSelfie = await prisma.kycDocument.findMany({
        where: {
            docType: 'selfie',
            status: 'APPROVED',
        },
        select: {
            url: true,
            tutor: {
                select: {
                    id: true,
                    userId: true,
                    user: { select: { id: true, avatarUrl: true, name: true, email: true } },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
    const seen = new Set();
    const toUpdate = [];
    for (const doc of tutorsWithSelfie) {
        const tutorId = doc.tutor.id;
        if (seen.has(tutorId))
            continue;
        seen.add(tutorId);
        const user = doc.tutor.user;
        if (!user || !doc.url)
            continue;
        if (user.avatarUrl === doc.url)
            continue;
        if (user.avatarUrl) {
            console.log(`  SKIP ${user.email} — already has avatar (${user.avatarUrl?.slice(0, 40)}...)`);
            continue;
        }
        toUpdate.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            currentAvatar: user.avatarUrl,
            selfieUrl: doc.url,
        });
    }
    console.log(`Found ${toUpdate.length} tutor(s) needing avatar backfill\n`);
    for (const item of toUpdate) {
        console.log(`  ${item.email ?? item.userId} — setting avatar to ${item.selfieUrl.slice(0, 60)}...`);
        if (!dryRun) {
            await prisma.user.update({
                where: { id: item.userId },
                data: { avatarUrl: item.selfieUrl },
            });
        }
    }
    console.log(dryRun ? '\nDry run complete. Run with --apply to execute.' : `\nDone. Updated ${toUpdate.length} user(s).`);
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=backfill-avatar-from-selfie.js.map