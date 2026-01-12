-- Add FAILED_TECHNICAL to BookingStatus enum
-- Safe recreate pattern for Postgres enum change

CREATE TYPE "BookingStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'FAILED_TECHNICAL', 'PENDING_SLOT');

ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus_new" USING "status"::text::"BookingStatus_new";

DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
