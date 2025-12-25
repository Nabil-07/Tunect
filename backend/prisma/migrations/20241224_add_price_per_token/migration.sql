-- AlterTable
ALTER TABLE "TutorTokenBalance" ADD COLUMN IF NOT EXISTS "pricePerToken" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Update existing records to have a default price per token
UPDATE "TutorTokenBalance" 
SET "pricePerToken" = 
  COALESCE(
    (SELECT "hourlyRate" FROM "Tutor" WHERE "Tutor"."id" = "TutorTokenBalance"."tutorId"),
    0
  )
WHERE "pricePerToken" = 0;
