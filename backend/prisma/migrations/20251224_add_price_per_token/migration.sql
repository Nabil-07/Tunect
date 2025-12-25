-- Add pricePerToken to TutorTokenBalance to track locked-in price
ALTER TABLE "TutorTokenBalance" ADD COLUMN IF NOT EXISTS "pricePerToken" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Update existing records to use current tutor hourlyRate as default
UPDATE "TutorTokenBalance" ttb
SET "pricePerToken" = t."hourlyRate"
FROM "Tutor" t
WHERE ttb."tutorId" = t.id AND ttb."pricePerToken" = 0;
