-- Migration: BookingAttendance table for robust attendance tracking
-- Date: 2026-02-21

CREATE TABLE IF NOT EXISTS "BookingAttendance" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,

  "tutorWaitingRoomAttended" BOOLEAN NOT NULL DEFAULT false,
  "studentWaitingRoomAttended" BOOLEAN NOT NULL DEFAULT false,

  "tutorJoinCount" INTEGER NOT NULL DEFAULT 0,
  "tutorLeaveCount" INTEGER NOT NULL DEFAULT 0,
  "tutorFirstJoinedAt" TIMESTAMP(3),
  "tutorLastJoinedAt" TIMESTAMP(3),
  "tutorLastLeftAt" TIMESTAMP(3),

  "studentJoinCount" INTEGER NOT NULL DEFAULT 0,
  "studentLeaveCount" INTEGER NOT NULL DEFAULT 0,
  "studentFirstJoinedAt" TIMESTAMP(3),
  "studentLastJoinedAt" TIMESTAMP(3),
  "studentLastLeftAt" TIMESTAMP(3),

  "classStartedAt" TIMESTAMP(3),
  "classEndedAt" TIMESTAMP(3),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BookingAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BookingAttendance_bookingId_key" ON "BookingAttendance"("bookingId");
CREATE INDEX IF NOT EXISTS "BookingAttendance_bookingId_idx" ON "BookingAttendance"("bookingId");

ALTER TABLE "BookingAttendance"
  ADD CONSTRAINT "BookingAttendance_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
