-- Phase 5 Schema Updates
-- Run this on Railway database for testing

-- Add AI scan fields to Assignment
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "fileType" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "aiScanStatus" TEXT DEFAULT 'PENDING';
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "aiScanReason" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "isVisibleToStudent" BOOLEAN DEFAULT false;

-- Add AI summary fields to SessionNote
ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "keyPoints" TEXT;
ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "homeworkSuggestions" TEXT;

-- Add referral fields
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "referredUserBonus" INTEGER DEFAULT 0;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "firstPaidSessionId" TEXT;

-- Make referralCode unique
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referralCode_key" ON "Referral"("referralCode");
CREATE INDEX IF NOT EXISTS "Referral_referralCode_idx" ON "Referral"("referralCode");

-- Update WhiteboardSession
ALTER TABLE "WhiteboardSession" ADD COLUMN IF NOT EXISTS "s3Url" TEXT;
ALTER TABLE "WhiteboardSession" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP;
ALTER TABLE "WhiteboardSession" ALTER COLUMN "data" DROP NOT NULL;

-- Create AiScanStatus enum values (Prisma will handle this)
-- PENDING, CLEAN, FLAGGED

-- Add index on Assignment aiScanStatus
CREATE INDEX IF NOT EXISTS "Assignment_aiScanStatus_idx" ON "Assignment"("aiScanStatus");

-- Update existing assignments to be visible if they were created before AI scan
UPDATE "Assignment" SET "isVisibleToStudent" = true WHERE "aiScanStatus" IS NULL;
UPDATE "Assignment" SET "aiScanStatus" = 'CLEAN' WHERE "aiScanStatus" IS NULL;
