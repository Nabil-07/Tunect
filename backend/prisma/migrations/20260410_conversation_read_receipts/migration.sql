-- Persist conversation read receipts so unread badges survive backend restarts.
CREATE TABLE IF NOT EXISTS "ConversationReadReceipt" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "readAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationReadReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationReadReceipt_conversationId_userId_key"
  ON "ConversationReadReceipt"("conversationId", "userId");

CREATE INDEX IF NOT EXISTS "ConversationReadReceipt_userId_idx"
  ON "ConversationReadReceipt"("userId");

ALTER TABLE "ConversationReadReceipt"
  ADD CONSTRAINT "ConversationReadReceipt_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationReadReceipt"
  ADD CONSTRAINT "ConversationReadReceipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
