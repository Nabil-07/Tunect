/**
 * One-time backfill script: set avatarUrl from approved KYC selfie
 * for tutors who had their selfie approved before the auto-set logic was added.
 *
 * Usage:  npx ts-node scripts/backfill-avatar-from-selfie.ts [--apply]
 *
 * Without --apply it runs in dry-run mode and only prints what it would change.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = !process.argv.includes('--apply');

async function main() {
  if (dryRun) console.log('=== DRY RUN (pass --apply to execute) ===\n');

  // Find all tutors who have an approved selfie KYC doc
  // but whose user.avatarUrl is null or different from the selfie url
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

  // Deduplicate: take the latest approved selfie per tutor
  const seen = new Set<string>();
  const toUpdate: { userId: string; email: string | null; name: string | null; currentAvatar: string | null; selfieUrl: string }[] = [];

  for (const doc of tutorsWithSelfie) {
    const tutorId = doc.tutor.id;
    if (seen.has(tutorId)) continue;
    seen.add(tutorId);

    const user = doc.tutor.user;
    if (!user || !doc.url) continue;

    // Skip if avatar already matches the selfie
    if (user.avatarUrl === doc.url) continue;

    // Only backfill if avatar is null (don't overwrite a deliberately set avatar)
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
