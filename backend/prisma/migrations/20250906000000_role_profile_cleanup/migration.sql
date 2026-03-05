-- ============================================================
-- role_profile_cleanup  (applied via db push; made idempotent)
-- All statements use IF NOT EXISTS / exception-safe DO blocks
-- so the shadow DB can replay this safely after earlier migrations.
-- NOTE: SELECT 1 was used for initial deploy. This full IF NOT EXISTS
-- version is for correct shadow DB replay in migrate dev.
-- ============================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "public"."ReconSide" AS ENUM ('BANK', 'GATEWAY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'TUTOR', 'STUDENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."TutorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."PaymentProvider" AS ENUM ('RAZORPAY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."TokenReason" AS ENUM ('BOOKING', 'REFUND', 'ADMIN_ADJUSTMENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."WalletReason" AS ENUM ('BOOKING_EARNED', 'ADJUSTMENT', 'PAYOUT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."PayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."OtpChannel" AS ENUM ('EMAIL', 'SMS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."OtpPurpose" AS ENUM ('PASSWORD_RESET'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "public"."Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatarUrl" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "hasChosenRole" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Tutor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hourlyRate" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."TutorStatus" NOT NULL DEFAULT 'PENDING',
    "country" TEXT,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,
    "tutor_tid" TEXT,

    CONSTRAINT "Tutor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grade" TEXT,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "student_sid" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Booking" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "tokensCharged" DECIMAL(18,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Reminder" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Payment" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountInMinor" INTEGER NOT NULL,
    "metadata" JSONB,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "providerSignature" TEXT,
    "tokensPurchased" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "public"."PaymentProvider" NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountInMinor" INTEGER NOT NULL,
    "providerRefundId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."TokenLedger" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "delta" DECIMAL(10,2) NOT NULL,
    "reason" "public"."TokenReason" NOT NULL,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tutorId" TEXT,

    CONSTRAINT "TokenLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."TutorTokenBalance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "TutorTokenBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."TutorWallet" (
    "tutorId" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorWallet_pkey" PRIMARY KEY ("tutorId")
);

CREATE TABLE IF NOT EXISTS "public"."TutorWalletLedger" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "bookingId" TEXT,
    "delta" DECIMAL(18,2) NOT NULL,
    "reason" "public"."WalletReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorWalletLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Payout" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Conversation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."Review" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingId" TEXT NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."KycDocument" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "public"."KycStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "public"."OtpPurpose" NOT NULL DEFAULT 'PASSWORD_RESET',
    "channel" "public"."OtpChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BankImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BankTxn" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "narration" TEXT,
    "ref" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "accountNo" TEXT,
    "hash" TEXT NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "BankTxn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."GatewayImport" (
    "id" TEXT NOT NULL,
    "provider" "public"."PaymentProvider" NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "GatewayImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."GatewayTxn" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "provider" "public"."PaymentProvider" NOT NULL,
    "event" TEXT,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "ref" TEXT,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2),
    "tax" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "hash" TEXT NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "GatewayTxn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ReconAdjustment" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ref" TEXT,
    "side" "public"."ReconSide" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ReconAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "public"."User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "public"."User"("phone");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "public"."User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Tutor_userId_key" ON "public"."Tutor"("userId");
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "tutor_tid_unique" ON "public"."Tutor"("tutor_tid"); EXCEPTION WHEN others THEN null; END $$;
CREATE INDEX IF NOT EXISTS "Tutor_status_updatedAt_idx" ON "public"."Tutor"("status", "updatedAt");
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "Tutor_isTrending_updatedAt_idx" ON "public"."Tutor"("isTrending", "updatedAt"); EXCEPTION WHEN others THEN null; END $$;
CREATE INDEX IF NOT EXISTS "Tutor_userId_idx" ON "public"."Tutor"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Student_userId_key" ON "public"."Student"("userId");
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "student_sid_unique" ON "public"."Student"("student_sid"); EXCEPTION WHEN others THEN null; END $$;
CREATE INDEX IF NOT EXISTS "Student_createdAt_idx" ON "public"."Student"("createdAt");
CREATE INDEX IF NOT EXISTS "Student_userId_idx" ON "public"."Student"("userId");
CREATE INDEX IF NOT EXISTS "Booking_tutorId_startTime_endTime_idx" ON "public"."Booking"("tutorId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Booking_studentId_startTime_endTime_idx" ON "public"."Booking"("studentId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Booking_status_startTime_idx" ON "public"."Booking"("status", "startTime");
CREATE INDEX IF NOT EXISTS "Reminder_sentAt_idx" ON "public"."Reminder"("sentAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Reminder_bookingId_kind_key" ON "public"."Reminder"("bookingId", "kind");
CREATE INDEX IF NOT EXISTS "AvailabilitySlot_tutorId_startTime_idx" ON "public"."AvailabilitySlot"("tutorId", "startTime");
CREATE INDEX IF NOT EXISTS "AvailabilitySlot_tutorId_endTime_idx" ON "public"."AvailabilitySlot"("tutorId", "endTime");
CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilitySlot_tutorId_startTime_endTime_key" ON "public"."AvailabilitySlot"("tutorId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Payment_userId_status_createdAt_idx" ON "public"."Payment"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "public"."Payment"("userId");
CREATE INDEX IF NOT EXISTS "Refund_paymentId_idx" ON "public"."Refund"("paymentId");
CREATE INDEX IF NOT EXISTS "TokenLedger_studentId_createdAt_idx" ON "public"."TokenLedger"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "TokenLedger_tutorId_idx" ON "public"."TokenLedger"("tutorId");
CREATE INDEX IF NOT EXISTS "TokenLedger_bookingId_idx" ON "public"."TokenLedger"("bookingId");
CREATE INDEX IF NOT EXISTS "TokenLedger_paymentId_idx" ON "public"."TokenLedger"("paymentId");
CREATE INDEX IF NOT EXISTS "TutorTokenBalance_studentId_tutorId_idx" ON "public"."TutorTokenBalance"("studentId", "tutorId");
CREATE UNIQUE INDEX IF NOT EXISTS "TutorTokenBalance_studentId_tutorId_key" ON "public"."TutorTokenBalance"("studentId", "tutorId");
CREATE INDEX IF NOT EXISTS "TutorWalletLedger_tutorId_createdAt_idx" ON "public"."TutorWalletLedger"("tutorId", "createdAt");
CREATE INDEX IF NOT EXISTS "TutorWalletLedger_bookingId_idx" ON "public"."TutorWalletLedger"("bookingId");
CREATE INDEX IF NOT EXISTS "Payout_tutorId_createdAt_idx" ON "public"."Payout"("tutorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Conversation_studentId_tutorId_createdAt_idx" ON "public"."Conversation"("studentId", "tutorId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_studentId_tutorId_bookingId_key" ON "public"."Conversation"("studentId", "tutorId", "bookingId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "public"."Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_senderId_createdAt_idx" ON "public"."Message"("senderId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_key" ON "public"."Review"("bookingId");
CREATE INDEX IF NOT EXISTS "Review_tutorId_createdAt_idx" ON "public"."Review"("tutorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Review_studentId_createdAt_idx" ON "public"."Review"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "KycDocument_tutorId_status_createdAt_idx" ON "public"."KycDocument"("tutorId", "status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_providerUserId_key" ON "public"."OAuthAccount"("providerUserId");
CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_provider_idx" ON "public"."OAuthAccount"("userId", "provider");
CREATE INDEX IF NOT EXISTS "OtpCode_userId_createdAt_idx" ON "public"."OtpCode"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "OtpCode_target_purpose_expiresAt_idx" ON "public"."OtpCode"("target", "purpose", "expiresAt");
CREATE INDEX IF NOT EXISTS "OtpCode_code_target_idx" ON "public"."OtpCode"("code", "target");
CREATE INDEX IF NOT EXISTS "BankImport_uploadedAt_idx" ON "public"."BankImport"("uploadedAt");
CREATE INDEX IF NOT EXISTS "BankTxn_txnDate_idx" ON "public"."BankTxn"("txnDate");
CREATE INDEX IF NOT EXISTS "BankTxn_ref_idx" ON "public"."BankTxn"("ref");
CREATE INDEX IF NOT EXISTS "BankTxn_paymentId_idx" ON "public"."BankTxn"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "BankTxn_hash_key" ON "public"."BankTxn"("hash");
CREATE INDEX IF NOT EXISTS "GatewayImport_provider_uploadedAt_idx" ON "public"."GatewayImport"("provider", "uploadedAt");
CREATE INDEX IF NOT EXISTS "GatewayTxn_txnDate_idx" ON "public"."GatewayTxn"("txnDate");
CREATE INDEX IF NOT EXISTS "GatewayTxn_ref_idx" ON "public"."GatewayTxn"("ref");
CREATE INDEX IF NOT EXISTS "GatewayTxn_paymentId_idx" ON "public"."GatewayTxn"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "GatewayTxn_hash_key" ON "public"."GatewayTxn"("hash");
CREATE INDEX IF NOT EXISTS "ReconAdjustment_date_idx" ON "public"."ReconAdjustment"("date");
CREATE INDEX IF NOT EXISTS "ReconAdjustment_ref_idx" ON "public"."ReconAdjustment"("ref");
CREATE INDEX IF NOT EXISTS "ReconAdjustment_side_date_idx" ON "public"."ReconAdjustment"("side", "date");

-- AddForeignKey (idempotent)
DO $$ BEGIN ALTER TABLE "public"."Tutor" ADD CONSTRAINT "Tutor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Reminder" ADD CONSTRAINT "Reminder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TokenLedger" ADD CONSTRAINT "TokenLedger_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TutorTokenBalance" ADD CONSTRAINT "TutorTokenBalance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TutorTokenBalance" ADD CONSTRAINT "TutorTokenBalance_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TutorWallet" ADD CONSTRAINT "TutorWallet_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TutorWalletLedger" ADD CONSTRAINT "TutorWalletLedger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."TutorWalletLedger" ADD CONSTRAINT "TutorWalletLedger_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."KycDocument" ADD CONSTRAINT "KycDocument_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "public"."Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."BankImport" ADD CONSTRAINT "BankImport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."BankTxn" ADD CONSTRAINT "BankTxn_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."BankTxn" ADD CONSTRAINT "BankTxn_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."BankImport"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."GatewayImport" ADD CONSTRAINT "GatewayImport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."GatewayTxn" ADD CONSTRAINT "GatewayTxn_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."GatewayTxn" ADD CONSTRAINT "GatewayTxn_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."GatewayImport"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "public"."ReconAdjustment" ADD CONSTRAINT "ReconAdjustment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

