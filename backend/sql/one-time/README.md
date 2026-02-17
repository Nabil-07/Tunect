# One-time SQL Scripts

This folder contains SQL scripts that were created for one-time maintenance, fixes, or backfills.

These files are intentionally kept for audit/history and should **not** be part of normal app startup or CI migration flow.

If a script must become repeatable, convert it into a proper Prisma/database migration.
