-- AlterTable: Drop orphaned sessionId column from User (already IF EXISTS, safe)
ALTER TABLE "User" DROP COLUMN IF EXISTS "sessionId";

-- CreateTable: AdminBroadcast (idempotent)
CREATE TABLE IF NOT EXISTS "AdminBroadcast" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "subject" TEXT,
    "message" VARCHAR(2000) NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdminPrivateMessage (idempotent)
CREATE TABLE IF NOT EXISTS "AdminPrivateMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPrivateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "AdminBroadcast_senderId_createdAt_idx" ON "AdminBroadcast"("senderId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminPrivateMessage_senderId_createdAt_idx" ON "AdminPrivateMessage"("senderId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminPrivateMessage_recipientId_createdAt_idx" ON "AdminPrivateMessage"("recipientId", "createdAt");

-- AddForeignKey (idempotent)
DO $$ BEGIN ALTER TABLE "AdminBroadcast" ADD CONSTRAINT "AdminBroadcast_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AdminPrivateMessage" ADD CONSTRAINT "AdminPrivateMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AdminPrivateMessage" ADD CONSTRAINT "AdminPrivateMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
