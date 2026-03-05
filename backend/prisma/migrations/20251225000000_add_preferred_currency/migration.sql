-- AlterTable: add preferredCurrency to User (idempotent)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredCurrency" TEXT NOT NULL DEFAULT 'INR';
