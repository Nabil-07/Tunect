/*
  Warnings:

  - The values [PURCHASE,DEBIT_BOOKING,REFUND_ADJUST] on the enum `TokenReason` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `amount` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `providerRef` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to alter the column `delta` on the `TokenLedger` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[bookingId]` on the table `Review` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `amountInMinor` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `Payment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `bookingId` to the `Review` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."PaymentProvider" AS ENUM ('RAZORPAY');

-- AlterEnum
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'CANCELED';

-- AlterEnum
BEGIN;
CREATE TYPE "public"."TokenReason_new" AS ENUM ('BOOKING', 'REFUND', 'ADMIN_ADJUSTMENT');
ALTER TABLE "public"."TokenLedger" ALTER COLUMN "reason" TYPE "public"."TokenReason_new" USING ("reason"::text::"public"."TokenReason_new");
ALTER TYPE "public"."TokenReason" RENAME TO "TokenReason_old";
ALTER TYPE "public"."TokenReason_new" RENAME TO "TokenReason";
DROP TYPE "public"."TokenReason_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_studentId_fkey";

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Payment" DROP COLUMN "amount",
DROP COLUMN "providerRef",
DROP COLUMN "studentId",
ADD COLUMN     "amountInMinor" INTEGER NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "providerOrderId" TEXT,
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "providerSignature" TEXT,
ADD COLUMN     "tokensPurchased" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "public"."PaymentProvider" NOT NULL;

-- AlterTable
ALTER TABLE "public"."Review" ADD COLUMN     "bookingId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."TokenLedger" ADD COLUMN     "tutorId" TEXT,
ALTER COLUMN "delta" SET DATA TYPE DECIMAL(10,2);

-- CreateTable
CREATE TABLE "public"."Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountInMinor" INTEGER NOT NULL,
    "providerRefundId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TutorTokenBalance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "TutorTokenBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "public"."Refund"("paymentId");

-- CreateIndex
CREATE INDEX "TutorTokenBalance_studentId_tutorId_idx" ON "public"."TutorTokenBalance"("studentId", "tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorTokenBalance_studentId_tutorId_key" ON "public"."TutorTokenBalance"("studentId", "tutorId");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_tutorId_endTime_idx" ON "public"."AvailabilitySlot"("tutorId", "endTime");

-- CreateIndex
CREATE INDEX "Booking_tutorId_startTime_endTime_idx" ON "public"."Booking"("tutorId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_studentId_startTime_endTime_idx" ON "public"."Booking"("studentId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_status_startTime_idx" ON "public"."Booking"("status", "startTime");

-- CreateIndex
CREATE INDEX "KycDocument_tutorId_status_createdAt_idx" ON "public"."KycDocument"("tutorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_provider_idx" ON "public"."OAuthAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "Payment_userId_status_createdAt_idx" ON "public"."Payment"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_sentAt_idx" ON "public"."Reminder"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "public"."Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_studentId_createdAt_idx" ON "public"."Review"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Student_createdAt_idx" ON "public"."Student"("createdAt");

-- CreateIndex
CREATE INDEX "TokenLedger_tutorId_idx" ON "public"."TokenLedger"("tutorId");

-- CreateIndex
CREATE INDEX "TokenLedger_bookingId_idx" ON "public"."TokenLedger"("bookingId");

-- CreateIndex
CREATE INDEX "TokenLedger_paymentId_idx" ON "public"."TokenLedger"("paymentId");

-- CreateIndex
CREATE INDEX "Tutor_status_updatedAt_idx" ON "public"."Tutor"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TutorTokenBalance" ADD CONSTRAINT "TutorTokenBalance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TutorTokenBalance" ADD CONSTRAINT "TutorTokenBalance_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
