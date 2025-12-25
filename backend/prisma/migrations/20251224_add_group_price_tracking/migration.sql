-- Add pricePerToken to GroupBookingParticipant to track each student's locked-in price
ALTER TABLE "GroupBookingParticipant" ADD COLUMN IF NOT EXISTS "pricePerToken" DECIMAL(10,2) NOT NULL DEFAULT 0;
