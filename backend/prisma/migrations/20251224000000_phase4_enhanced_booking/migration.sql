-- Phase 4: Enhanced Booking Features
-- Group Sessions, Waitlist, Recurring Bookings, Google Meet Integration

-- ==================== Booking Table Updates ====================
-- Add Group Session fields
ALTER TABLE "Booking" ADD COLUMN "isGroupSession" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "maxStudents" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Booking" ADD COLUMN "currentEnrollment" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Booking" ADD COLUMN "pricePerStudent" DECIMAL(18,2);

-- Add Google Meet Integration fields
ALTER TABLE "Booking" ADD COLUMN "meetingUrl" TEXT;
ALTER TABLE "Booking" ADD COLUMN "meetingProvider" TEXT DEFAULT 'google_meet';

-- Add Recurring Template link
ALTER TABLE "Booking" ADD COLUMN "recurringTemplateId" TEXT;

-- ==================== Create GroupBookingParticipant Table ====================
CREATE TABLE "GroupBookingParticipant" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tokensPaid" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBookingParticipant_pkey" PRIMARY KEY ("id")
);

-- Create indexes for GroupBookingParticipant
CREATE INDEX "GroupBookingParticipant_bookingId_idx" ON "GroupBookingParticipant"("bookingId");
CREATE INDEX "GroupBookingParticipant_studentId_idx" ON "GroupBookingParticipant"("studentId");

-- ==================== Waitlist Table Enhancements ====================
-- Add new waitlist fields
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "requestedStartTime" TIMESTAMP(3);
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "requestedEndTime" TIMESTAMP(3);
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'WAITING';
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- ==================== RecurringTemplate Table Enhancements ====================
-- Add group session support to recurring templates
ALTER TABLE "RecurringTemplate" ADD COLUMN "isGroupSession" BOOLEAN;
ALTER TABLE "RecurringTemplate" ADD COLUMN "maxGroupSize" INTEGER;
ALTER TABLE "RecurringTemplate" ADD COLUMN "pricePerStudent" DECIMAL(18,2);

-- Add generation tracking
ALTER TABLE "RecurringTemplate" ADD COLUMN "lastGeneratedDate" TIMESTAMP(3);
ALTER TABLE "RecurringTemplate" ADD COLUMN "nextGenerationDate" TIMESTAMP(3);

-- ==================== Foreign Keys ====================
-- Add foreign key constraints
ALTER TABLE "GroupBookingParticipant" 
    ADD CONSTRAINT "GroupBookingParticipant_bookingId_fkey" 
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupBookingParticipant" 
    ADD CONSTRAINT "GroupBookingParticipant_studentId_fkey" 
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking" 
    ADD CONSTRAINT "Booking_recurringTemplateId_fkey" 
    FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Waitlist" 
    ADD CONSTRAINT "Waitlist_bookingId_fkey" 
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==================== Indexes for Performance ====================
-- Index for group session queries
CREATE INDEX "Booking_isGroupSession_idx" ON "Booking"("isGroupSession");
CREATE INDEX "Booking_recurringTemplateId_idx" ON "Booking"("recurringTemplateId");

-- Index for waitlist queries
CREATE INDEX "Waitlist_status_idx" ON "Waitlist"("status");
CREATE INDEX "Waitlist_tutorId_status_idx" ON "Waitlist"("tutorId", "status");
CREATE INDEX "Waitlist_studentId_idx" ON "Waitlist"("studentId");
CREATE INDEX "Waitlist_bookingId_idx" ON "Waitlist"("bookingId");
