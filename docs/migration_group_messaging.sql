-- Migration: Add Group Messaging System
-- This adds support for:
-- 1. Group session chats (tutor-only posting)
-- 2. Admin broadcast groups (subject-wise)
-- 3. Token-gated 1-on-1 messaging

-- Step 1: Add ConversationType enum
CREATE TYPE "ConversationType" AS ENUM ('ONE_ON_ONE', 'GROUP_SESSION', 'ADMIN_BROADCAST');

-- Step 2: Add MemberRole enum
CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'MODERATOR', 'MEMBER', 'READ_ONLY');

-- Step 3: Update Conversation table
ALTER TABLE "Conversation" 
  ADD COLUMN "type" "ConversationType" DEFAULT 'ONE_ON_ONE',
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "isActive" BOOLEAN DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- Make studentId and tutorId nullable for group chats
ALTER TABLE "Conversation" 
  ALTER COLUMN "studentId" DROP NOT NULL,
  ALTER COLUMN "tutorId" DROP NOT NULL;

-- Add foreign key for createdBy
ALTER TABLE "Conversation" 
  ADD CONSTRAINT "Conversation_createdById_fkey" 
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;

-- Add indexes
CREATE INDEX "Conversation_type_isActive_idx" ON "Conversation"("type", "isActive");
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- Step 4: Create ConversationMember table
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "canPost" BOOLEAN NOT NULL DEFAULT true,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint and indexes
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" 
  ON "ConversationMember"("conversationId", "userId");
CREATE INDEX "ConversationMember_userId_conversationId_idx" 
  ON "ConversationMember"("userId", "conversationId");

-- Add foreign keys
ALTER TABLE "ConversationMember" 
  ADD CONSTRAINT "ConversationMember_conversationId_fkey" 
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE;

ALTER TABLE "ConversationMember" 
  ADD CONSTRAINT "ConversationMember_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Step 5: Update Message table for soft delete
ALTER TABLE "Message" 
  ADD COLUMN "isDeleted" BOOLEAN DEFAULT false,
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Add foreign key for deletedBy
ALTER TABLE "Message" 
  ADD CONSTRAINT "Message_deletedById_fkey" 
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL;

-- Add index for soft deletes
CREATE INDEX "Message_isDeleted_idx" ON "Message"("isDeleted");

-- Step 6: Add conversationId to GroupBooking
ALTER TABLE "GroupBooking" 
  ADD COLUMN "conversationId" TEXT UNIQUE;

-- Add foreign key
ALTER TABLE "GroupBooking" 
  ADD CONSTRAINT "GroupBooking_conversationId_fkey" 
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL;

-- Step 7: Add User relation for conversation members
ALTER TABLE "User" 
  ADD CONSTRAINT "User_conversationMember_relation" -- Placeholder for Prisma relation

-- Step 8: Migrate existing data
-- Set all existing conversations to ONE_ON_ONE type
UPDATE "Conversation" SET "type" = 'ONE_ON_ONE' WHERE "type" IS NULL;

-- Update lastMessageAt for existing conversations
UPDATE "Conversation" c
SET "lastMessageAt" = (
  SELECT MAX(m."createdAt")
  FROM "Message" m
  WHERE m."conversationId" = c."id"
);

-- Step 9: Add triggers for lastMessageAt auto-update
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Conversation"
  SET "lastMessageAt" = NEW."createdAt",
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."conversationId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_created_update_conversation
  AFTER INSERT ON "Message"
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Rollback script (save this separately)
/*
-- To rollback this migration:

DROP TRIGGER IF EXISTS message_created_update_conversation ON "Message";
DROP FUNCTION IF EXISTS update_conversation_last_message();

ALTER TABLE "GroupBooking" DROP COLUMN "conversationId";
ALTER TABLE "Message" DROP COLUMN "isDeleted", DROP COLUMN "deletedById", DROP COLUMN "deletedAt", DROP COLUMN "updatedAt";
DROP TABLE IF EXISTS "ConversationMember";
ALTER TABLE "Conversation" DROP COLUMN "type", DROP COLUMN "name", DROP COLUMN "description", DROP COLUMN "createdById", DROP COLUMN "isActive", DROP COLUMN "updatedAt", DROP COLUMN "lastMessageAt";
DROP TYPE IF EXISTS "MemberRole";
DROP TYPE IF EXISTS "ConversationType";
*/
