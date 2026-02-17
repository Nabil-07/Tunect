-- Fix duplicate tutor wallet ledger entries
-- This script removes duplicate BOOKING_EARNED entries, keeping only the first one created per booking

-- First, let's identify duplicates
SELECT 
  tutorId, 
  bookingId, 
  reason, 
  COUNT(*) as count,
  MIN(createdAt) as first_created,
  MAX(createdAt) as last_created,
  SUM(delta) as total_amount
FROM "TutorWalletLedger"
WHERE bookingId IS NOT NULL 
  AND reason = 'BOOKING_EARNED'
GROUP BY tutorId, bookingId, reason
HAVING COUNT(*) > 1;

-- Remove duplicate entries, keeping the earliest one for each (tutorId, bookingId, reason)
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY tutorId, bookingId, reason ORDER BY createdAt ASC) as rn
  FROM "TutorWalletLedger"
  WHERE bookingId IS NOT NULL 
    AND reason = 'BOOKING_EARNED'
)
DELETE FROM "TutorWalletLedger"
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Fix wallet balances: recalculate from ledger
-- Create temp table for calculations
WITH ledger_sums AS (
  SELECT 
    tutorId,
    SUM(CASE WHEN reason = 'BOOKING_EARNED' THEN delta ELSE 0 END) as earned,
    SUM(CASE WHEN reason = 'PAYOUT' THEN delta ELSE 0 END) as paid_out,
    SUM(CASE WHEN reason = 'ADJUSTMENT' THEN delta ELSE 0 END) as adjustments,
    SUM(delta) as total_balance
  FROM "TutorWalletLedger"
  GROUP BY tutorId
)
UPDATE "TutorWallet" w
SET balance = ls.total_balance
FROM ledger_sums ls
WHERE w."tutorId" = ls.tutorId 
  AND w.balance != ls.total_balance;

-- Verify the fix
SELECT 
  w.tutorId,
  w.balance as wallet_balance,
  COALESCE(SUM(l.delta), 0) as ledger_sum,
  (w.balance - COALESCE(SUM(l.delta), 0)) as difference
FROM "TutorWallet" w
LEFT JOIN "TutorWalletLedger" l ON w."tutorId" = l.tutorId
GROUP BY w.tutorId, w.balance
HAVING w.balance != COALESCE(SUM(l.delta), 0);
