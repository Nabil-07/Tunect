-- Fix old earning entries that were calculated incorrectly
-- The formula was: tokens * (100 - fee) / 100
-- Should be: (tokens * hourlyRate) * (100 - fee) / 100

-- For Aditya Anand (Tutor ID: cmklipl3u0005pa7oist0sv54, hourlyRate: 500)
-- Old calculation: 1 * 78/100 = 0.78 (showed as 0.82)
-- New calculation: (1 * 500) * 78/100 = 390

-- Get the booking details
SELECT 
  b.id,
  b.tutorId,
  b.tokensCharged,
  t.hourlyRate,
  wl.id as ledger_id,
  wl.delta as old_delta,
  (CAST(b.tokensCharged AS DECIMAL) * t."hourlyRate" * 78 / 100) as correct_delta
FROM "TutorWalletLedger" wl
JOIN "Booking" b ON wl."bookingId" = b.id
JOIN "Tutor" t ON wl."tutorId" = t.id
WHERE wl.reason = 'BOOKING_EARNED'
  AND wl."tutorId" = 'cmklipl3u0005pa7oist0sv54'
ORDER BY wl."createdAt" DESC;

-- Delete old incorrect entries
DELETE FROM "TutorWalletLedger"
WHERE id IN (
  SELECT wl.id FROM "TutorWalletLedger" wl
  JOIN "Booking" b ON wl."bookingId" = b.id
  WHERE wl.reason = 'BOOKING_EARNED'
    AND wl."tutorId" = 'cmklipl3u0005pa7oist0sv54'
    AND b."isDemo" = false
);

-- Update tutor wallet to correct balance
-- First, get correct total from completed bookings
WITH correct_earnings AS (
  SELECT 
    b."tutorId",
    SUM(CAST(b."tokensCharged" AS DECIMAL) * t."hourlyRate" * (100 - CASE 
      WHEN t."hourlyRate" < 400 THEN 25
      WHEN t."hourlyRate" < 700 THEN 22
      ELSE 18
    END) / 100) as total_earned
  FROM "Booking" b
  JOIN "Tutor" t ON b."tutorId" = t.id
  WHERE b.status = 'COMPLETED'
    AND b."isDemo" = false
    AND CAST(b."tokensCharged" AS DECIMAL) > 0
    AND b."tutorId" = 'cmklipl3u0005pa7oist0sv54'
  GROUP BY b."tutorId"
)
UPDATE "TutorWallet"
SET balance = (SELECT total_earned FROM correct_earnings WHERE "tutorId" = 'cmklipl3u0005pa7oist0sv54')
WHERE "tutorId" = 'cmklipl3u0005pa7oist0sv54';

-- Re-insert correct ledger entries
INSERT INTO "TutorWalletLedger" ("id", "tutorId", "bookingId", "delta", "reason", "note", "createdAt", "updatedAt")
SELECT 
  CONCAT('ledger_', b.id, '_', NOW()::text),
  b."tutorId",
  b.id,
  CAST(b."tokensCharged" AS DECIMAL) * t."hourlyRate" * (100 - CASE 
    WHEN t."hourlyRate" < 400 THEN 25
    WHEN t."hourlyRate" < 700 THEN 22
    ELSE 18
  END) / 100,
  'BOOKING_EARNED',
  'Fixed earning calculation',
  NOW(),
  NOW()
FROM "Booking" b
JOIN "Tutor" t ON b."tutorId" = t.id
WHERE b.status = 'COMPLETED'
  AND b."isDemo" = false
  AND CAST(b."tokensCharged" AS DECIMAL) > 0
  AND b."tutorId" = 'cmklipl3u0005pa7oist0sv54'
ON CONFLICT DO NOTHING;

-- Verify the fix
SELECT 
  t.id,
  t."hourlyRate",
  w.balance as wallet_balance,
  SUM(CAST(wl.delta AS DECIMAL)) as ledger_total
FROM "Tutor" t
LEFT JOIN "TutorWallet" w ON t.id = w."tutorId"
LEFT JOIN "TutorWalletLedger" wl ON t.id = wl."tutorId" AND wl.reason = 'BOOKING_EARNED'
WHERE t.id = 'cmklipl3u0005pa7oist0sv54'
GROUP BY t.id, t."hourlyRate", w.balance;
