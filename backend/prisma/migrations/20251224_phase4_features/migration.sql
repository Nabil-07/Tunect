-- Phase 4: Enhanced Booking Features Migration

-- 1. Add group session support to Booking table
ALTER TABLE "Booking" ADD COLUMN "maxStudents" INTEGER DEFAULT 1;
ALTER TABLE "Booking" ADD COLUMN "isGroupSession" BOOLEAN DEFAULT FALSE;
ALTER TABLE "Booking" ADD COLUMN "currentEnrollment" INTEGER DEFAULT 1;
ALTER TABLE "Booking" ADD COLUMN "pricePerStudent" DECIMAL(18,2);
ALTER TABLE "Booking" ADD COLUMN "meetingUrl" TEXT;
ALTER TABLE "Booking" ADD COLUMN "meetingProvider" TEXT DEFAULT 'google_meet';
ALTER TABLE "Booking" ADD COLUMN "recurringTemplateId" TEXT;

-- 2. Create GroupBookingParticipant junction table for many-to-many
CREATE TABLE "GroupBookingParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "bookingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokensPaid" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    
    CONSTRAINT "GroupBookingParticipant_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE,
    CONSTRAINT "GroupBookingParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "GroupBookingParticipant_bookingId_studentId_key" ON "GroupBookingParticipant"("bookingId", "studentId");
CREATE INDEX "GroupBookingParticipant_bookingId_idx" ON "GroupBookingParticipant"("bookingId");
CREATE INDEX "GroupBookingParticipant_studentId_idx" ON "GroupBookingParticipant"("studentId");

-- 3. Create Waitlist table
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedStartTime" TIMESTAMP(3) NOT NULL,
    "requestedEndTime" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    
    CONSTRAINT "Waitlist_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE,
    CONSTRAINT "Waitlist_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE
);

CREATE INDEX "Waitlist_tutorId_idx" ON "Waitlist"("tutorId");
CREATE INDEX "Waitlist_studentId_idx" ON "Waitlist"("studentId");
CREATE INDEX "Waitlist_status_idx" ON "Waitlist"("status");
CREATE INDEX "Waitlist_requestedStartTime_idx" ON "Waitlist"("requestedStartTime");

-- 4. Add recurring booking support fields to RecurringTemplate
ALTER TABLE "RecurringTemplate" ADD COLUMN IF NOT EXISTS "lastGeneratedDate" TIMESTAMP(3);
ALTER TABLE "RecurringTemplate" ADD COLUMN IF NOT EXISTS "nextGenerationDate" TIMESTAMP(3);
ALTER TABLE "RecurringTemplate" ADD COLUMN IF NOT EXISTS "maxGroupSize" INTEGER DEFAULT 1;
ALTER TABLE "RecurringTemplate" ADD COLUMN IF NOT EXISTS "isGroupSession" BOOLEAN DEFAULT FALSE;

-- 5. Add foreign key for recurring template to bookings
CREATE INDEX IF NOT EXISTS "Booking_recurringTemplateId_idx" ON "Booking"("recurringTemplateId");

-- 6. Add comments
COMMENT ON COLUMN "Booking"."maxStudents" IS 'Maximum number of students for group sessions';
COMMENT ON COLUMN "Booking"."isGroupSession" IS 'Whether this is a group session';
COMMENT ON COLUMN "Booking"."currentEnrollment" IS 'Current number of enrolled students';
COMMENT ON COLUMN "Booking"."pricePerStudent" IS 'Price per student for group sessions';
COMMENT ON COLUMN "Booking"."meetingUrl" IS 'Google Meet or other video conferencing URL';
COMMENT ON COLUMN "Booking"."recurringTemplateId" IS 'Link to recurring template if auto-generated';
