SET search_path TO public;
-- CreateEnum
CREATE TYPE "public"."ReconSide" AS ENUM ('BANK', 'GATEWAY');

-- AlterTable
ALTER TABLE "public"."Tutor" 
DROP COLUMN IF EXISTS "highestQualification",
DROP COLUMN IF EXISTS "yearsExperience";

-- CreateTable
CREATE TABLE "public"."BankImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankTxn" (
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

-- CreateTable
CREATE TABLE "public"."GatewayImport" (
    "id" TEXT NOT NULL,
    "provider" "public"."PaymentProvider" NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "GatewayImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GatewayTxn" (
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

-- CreateTable
CREATE TABLE "public"."ReconAdjustment" (
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

-- CreateIndex
CREATE INDEX "BankImport_uploadedAt_idx" ON "public"."BankImport"("uploadedAt");

-- CreateIndex
CREATE INDEX "BankTxn_txnDate_idx" ON "public"."BankTxn"("txnDate");

-- CreateIndex
CREATE INDEX "BankTxn_ref_idx" ON "public"."BankTxn"("ref");

-- CreateIndex
CREATE INDEX "BankTxn_paymentId_idx" ON "public"."BankTxn"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTxn_hash_key" ON "public"."BankTxn"("hash");

-- CreateIndex
CREATE INDEX "GatewayImport_provider_uploadedAt_idx" ON "public"."GatewayImport"("provider", "uploadedAt");

-- CreateIndex
CREATE INDEX "GatewayTxn_txnDate_idx" ON "public"."GatewayTxn"("txnDate");

-- CreateIndex
CREATE INDEX "GatewayTxn_ref_idx" ON "public"."GatewayTxn"("ref");

-- CreateIndex
CREATE INDEX "GatewayTxn_paymentId_idx" ON "public"."GatewayTxn"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayTxn_hash_key" ON "public"."GatewayTxn"("hash");

-- CreateIndex
CREATE INDEX "ReconAdjustment_date_idx" ON "public"."ReconAdjustment"("date");

-- CreateIndex
CREATE INDEX "ReconAdjustment_ref_idx" ON "public"."ReconAdjustment"("ref");

-- CreateIndex
CREATE INDEX "ReconAdjustment_side_date_idx" ON "public"."ReconAdjustment"("side", "date");

-- AddForeignKey
ALTER TABLE "public"."BankImport" ADD CONSTRAINT "BankImport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankTxn" ADD CONSTRAINT "BankTxn_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankTxn" ADD CONSTRAINT "BankTxn_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."BankImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GatewayImport" ADD CONSTRAINT "GatewayImport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GatewayTxn" ADD CONSTRAINT "GatewayTxn_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GatewayTxn" ADD CONSTRAINT "GatewayTxn_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."GatewayImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReconAdjustment" ADD CONSTRAINT "ReconAdjustment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


