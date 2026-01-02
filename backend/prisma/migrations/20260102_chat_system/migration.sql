-- Chat System Migration
-- Adds support for DIRECT, GROUP_SESSION, and ADMIN_BROADCAST conversations
-- with token gating and admin features

-- Add new enums
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP_SESSION', 'ADMIN_BROADCAST');
CREATE TYPE "ConversationMemberRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "MessageAuditAction" AS ENUM ('CREATED', 'DELETED', 'RESTORED');

-- Update Conversation table
ALTER TABLE "Conversation" 
  ADD COLUMN "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "referenceId" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "studentId" DROP NOT NULL,
  ALTER COLUMN "tutorId" DROP NOT NULL;

-- Update Message table
ALTER TABLE "Message"
  ADD COLUMN "content" VARCHAR(2000),
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Copy text to content for existing messages
UPDATE "Message" SET "content" = "text" WHERE "content" IS NULL;

-- Make content NOT NULL after migration
ALTER TABLE "Message" ALTER COLUMN "content" SET NOT NULL;

-- Create ConversationMember table
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConversationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- Create MessageAuditLog table
CREATE TABLE "MessageAuditLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "action" "MessageAuditAction" NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "MessageAuditLog_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Conversation
CREATE INDEX "Conversation_type_isActive_idx" ON "Conversation"("type", "isActive");
CREATE INDEX "Conversation_referenceId_idx" ON "Conversation"("referenceId");

-- Create indexes for Message
CREATE INDEX "Message_isDeleted_idx" ON "Message"("isDeleted");

-- Create indexes and constraints for ConversationMember
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");
CREATE INDEX "ConversationMember_conversationId_leftAt_idx" ON "ConversationMember"("conversationId", "leftAt");

-- Create indexes for MessageAuditLog
CREATE INDEX "MessageAuditLog_messageId_performedAt_idx" ON "MessageAuditLog"("messageId", "performedAt");
CREATE INDEX "MessageAuditLog_performedBy_performedAt_idx" ON "MessageAuditLog"("performedBy", "performedAt");

-- Add foreign keys
ALTER TABLE "Message" ADD CONSTRAINT "Message_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageAuditLog" ADD CONSTRAINT "MessageAuditLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAuditLog" ADD CONSTRAINT "MessageAuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing conversations to have members
INSERT INTO "ConversationMember" ("id", "conversationId", "userId", "role", "joinedAt")
SELECT 
    gen_random_uuid()::text,
    c.id,
    s."userId",
    'MEMBER'::"ConversationMemberRole",
    c."createdAt"
FROM "Conversation" c
INNER JOIN "Student" s ON c."studentId" = s.id
WHERE c."studentId" IS NOT NULL;

INSERT INTO "ConversationMember" ("id", "conversationId", "userId", "role", "joinedAt")
SELECT 
    gen_random_uuid()::text,
    c.id,
    t."userId",
    'MEMBER'::"ConversationMemberRole",
    c."createdAt"
FROM "Conversation" c
INNER JOIN "Tutor" t ON c."tutorId" = t.id
WHERE c."tutorId" IS NOT NULL;

-- Set referenceId for GROUP_SESSION type (based on bookingId)
UPDATE "Conversation" 
SET 
    "type" = 'GROUP_SESSION'::"ConversationType",
    "referenceId" = "bookingId"
WHERE "bookingId" IS NOT NULL;
