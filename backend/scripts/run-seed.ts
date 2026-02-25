import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const prisma = new PrismaClient();
  try {
    const sqlPath = path.resolve(__dirname, '../../database/seed.sql');
    const fullSql = fs.readFileSync(sqlPath, 'utf8');

    // Remove comment-only lines, strip BEGIN/COMMIT
    const lines = fullSql.split('\n');
    const cleaned: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // skip pure comment lines and BEGIN/COMMIT
      if (trimmed.startsWith('--')) continue;
      if (/^BEGIN\s*;?\s*$/i.test(trimmed)) continue;
      if (/^COMMIT\s*;?\s*$/i.test(trimmed)) continue;
      cleaned.push(line);
    }

    // Join and split on blank-line boundaries (each INSERT block is separated by blank lines)
    const body = cleaned.join('\n');
    const statements = body
      .split(/;\s*\n\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Running ${statements.length} SQL statements...`);

    let success = 0;
    let skipped = 0;

    for (let i = 0; i < statements.length; i++) {
      let stmt = statements[i];
      if (!stmt.endsWith(';')) stmt += ';';

      try {
        const result = await prisma.$executeRawUnsafe(stmt);
        success++;
        console.log(`  [${i + 1}/${statements.length}] OK (${result} rows affected)`);
      } catch (err: any) {
        if (err.meta?.code === '23505' || err.message?.includes('unique constraint')) {
          skipped++;
          console.log(`  [${i + 1}/${statements.length}] SKIPPED (already exists)`);
        } else if (err.meta?.code === '23503') {
          skipped++;
          console.log(`  [${i + 1}/${statements.length}] SKIPPED (FK ref missing): ${err.meta?.message?.substring(0, 100)}`);
        } else {
          console.error(`  [${i + 1}/${statements.length}] FAILED:`, stmt.substring(0, 150));
          console.error('  Error:', err.meta?.message || err.message);
          throw err;
        }
      }
    }

    console.log(`\nSeed completed! ${success} succeeded, ${skipped} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
