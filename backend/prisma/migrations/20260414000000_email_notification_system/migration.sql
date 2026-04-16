-- Migration: Email Notification System
-- Adds fields required for email verification, promo opt-out, no-show tracking,
-- student profile nudge, and tutor availability alert throttling.

-- User: email verification fields
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerificationTokenExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailPromoOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "noShowCount" INTEGER NOT NULL DEFAULT 0;

-- Unique index on emailVerificationToken (sparse — only set when token is active)
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerificationToken_key"
  ON "User"("emailVerificationToken")
  WHERE "emailVerificationToken" IS NOT NULL;

-- Student: profile nudge tracking
ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "profileNudgeSentAt" TIMESTAMP(3);

-- FavoriteTutor: last availability alert timestamp (max 1/day throttle)
ALTER TABLE "FavoriteTutor"
  ADD COLUMN IF NOT EXISTS "lastAvailabilityAlertSentAt" TIMESTAMP(3);
