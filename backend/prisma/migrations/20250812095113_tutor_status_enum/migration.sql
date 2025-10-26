/*
  Warnings:

  - You are about to drop the column `isApproved` on the `Tutor` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."TutorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "public"."Tutor" DROP COLUMN "isApproved",
ADD COLUMN     "status" "public"."TutorStatus" NOT NULL DEFAULT 'PENDING';
