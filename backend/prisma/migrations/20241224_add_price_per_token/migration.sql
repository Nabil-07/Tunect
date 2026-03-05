-- Add pricePerToken to TutorTokenBalance if the table already exists.
-- Wrapped in a conditional block so this migration is a safe no-op when
-- replayed on a fresh database (the table is created later by
-- 20250812142957_razorpay_payments_fix_relations; the 20251224 version of
-- this migration adds the column after table creation).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'TutorTokenBalance'
  ) THEN
    ALTER TABLE "TutorTokenBalance"
      ADD COLUMN IF NOT EXISTS "pricePerToken" DECIMAL(10,2) NOT NULL DEFAULT 0;

    UPDATE "TutorTokenBalance"
    SET "pricePerToken" = COALESCE(
      (SELECT "hourlyRate" FROM "Tutor" WHERE "Tutor"."id" = "TutorTokenBalance"."tutorId"),
      0
    )
    WHERE "pricePerToken" = 0;
  END IF;
END $$;
