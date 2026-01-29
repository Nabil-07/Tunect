-- Migration: Availability Tracking, Refund System, and Admin Enhancements
-- Date: 2026-01-27

-- Add availability tracking fields to Tutor
ALTER TABLE "Tutor" 
  ADD COLUMN IF NOT EXISTS "lastActiveDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "availabilityConsistency" DECIMAL(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "weeklyAvailabilityHours" DECIMAL(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "lastAvailabilityUpdate" TIMESTAMP(3);

-- Create TokenTransferRequest table
CREATE TABLE IF NOT EXISTS "TokenTransferRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromTutorId" TEXT NOT NULL,
    "toTutorId" TEXT NOT NULL,
    "tokenAmount" DECIMAL(18, 2) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminId" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    
    CONSTRAINT "TokenTransferRequest_pkey" PRIMARY KEY ("id")
);

-- Create RefundRequest table for 7-day refunds
CREATE TABLE IF NOT EXISTS "RefundRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "tokenAmount" DECIMAL(18, 2) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminId" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- Create TutorAvailabilityAlert table for tracking alerts sent
CREATE TABLE IF NOT EXISTS "TutorAvailabilityAlert" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "tokenAmount" DECIMAL(18, 2),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "refundRequested" BOOLEAN DEFAULT false,
    
    CONSTRAINT "TutorAvailabilityAlert_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "TokenTransferRequest" 
  ADD CONSTRAINT "TokenTransferRequest_studentId_fkey" 
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenTransferRequest" 
  ADD CONSTRAINT "TokenTransferRequest_fromTutorId_fkey" 
  FOREIGN KEY ("fromTutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenTransferRequest" 
  ADD CONSTRAINT "TokenTransferRequest_toTutorId_fkey" 
  FOREIGN KEY ("toTutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenTransferRequest" 
  ADD CONSTRAINT "TokenTransferRequest_adminId_fkey" 
  FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefundRequest" 
  ADD CONSTRAINT "RefundRequest_studentId_fkey" 
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefundRequest" 
  ADD CONSTRAINT "RefundRequest_tutorId_fkey" 
  FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefundRequest" 
  ADD CONSTRAINT "RefundRequest_adminId_fkey" 
  FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TutorAvailabilityAlert" 
  ADD CONSTRAINT "TutorAvailabilityAlert_tutorId_fkey" 
  FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutorAvailabilityAlert" 
  ADD CONSTRAINT "TutorAvailabilityAlert_studentId_fkey" 
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "TokenTransferRequest_studentId_idx" ON "TokenTransferRequest"("studentId");
CREATE INDEX IF NOT EXISTS "TokenTransferRequest_status_idx" ON "TokenTransferRequest"("status");
CREATE INDEX IF NOT EXISTS "TokenTransferRequest_createdAt_idx" ON "TokenTransferRequest"("createdAt");

CREATE INDEX IF NOT EXISTS "RefundRequest_studentId_idx" ON "RefundRequest"("studentId");
CREATE INDEX IF NOT EXISTS "RefundRequest_status_idx" ON "RefundRequest"("status");
CREATE INDEX IF NOT EXISTS "RefundRequest_createdAt_idx" ON "RefundRequest"("createdAt");

CREATE INDEX IF NOT EXISTS "TutorAvailabilityAlert_tutorId_idx" ON "TutorAvailabilityAlert"("tutorId");
CREATE INDEX IF NOT EXISTS "TutorAvailabilityAlert_studentId_idx" ON "TutorAvailabilityAlert"("studentId");
CREATE INDEX IF NOT EXISTS "TutorAvailabilityAlert_alertType_idx" ON "TutorAvailabilityAlert"("alertType");

CREATE INDEX IF NOT EXISTS "Tutor_lastActiveDate_idx" ON "Tutor"("lastActiveDate");
CREATE INDEX IF NOT EXISTS "Tutor_isFeatured_idx" ON "Tutor"("isFeatured");
CREATE INDEX IF NOT EXISTS "Tutor_isVerified_idx" ON "Tutor"("isVerified");

-- Enhance AuditLog to track endpoint and IP (if not already present)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'AuditLog' AND column_name = 'endpoint'
    ) THEN
        ALTER TABLE "AuditLog" ADD COLUMN "endpoint" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'AuditLog' AND column_name = 'ipAddress'
    ) THEN
        ALTER TABLE "AuditLog" ADD COLUMN "ipAddress" TEXT;
    END IF;
END $$;
