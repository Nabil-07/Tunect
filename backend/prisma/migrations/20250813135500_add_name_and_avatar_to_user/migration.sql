/*
  Warnings:

  - You are about to drop the column `sessionId` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "sessionId",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "name" TEXT;
