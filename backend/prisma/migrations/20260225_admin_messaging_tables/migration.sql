-- AlterTable: Drop orphaned sessionId column from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "sessionId";

-- CreateTable: AdminBroadcast
CREATE TABLE "AdminBroadcast" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "subject" TEXT,
    "message" VARCHAR(2000) NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdminPrivateMessage
CREATE TABLE "AdminPrivateMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPrivateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminBroadcast_senderId_createdAt_idx" ON "AdminBroadcast"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminPrivateMessage_senderId_createdAt_idx" ON "AdminPrivateMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminPrivateMessage_recipientId_createdAt_idx" ON "AdminPrivateMessage"("recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminBroadcast" ADD CONSTRAINT "AdminBroadcast_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPrivateMessage" ADD CONSTRAINT "AdminPrivateMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPrivateMessage" ADD CONSTRAINT "AdminPrivateMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
