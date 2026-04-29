-- ============================================================================
-- Backfill: TutorTokenLot + BookingLotConsumption
-- ============================================================================
-- Purpose:
--   Populate the new lot-based pricing tables from the existing TutorTokenBalance
--   wallets and historical Booking rows.
--
-- SAFETY GUARANTEES:
--   * Strictly INSERT-only. Never updates or deletes anything.
--   * Idempotent: uses deterministic `id`s + WHERE NOT EXISTS, so re-running
--     is a no-op. Safe to run multiple times.
--   * Touches ONLY the new tables: "TutorTokenLot", "BookingLotConsumption".
--     Does NOT modify "TutorTokenBalance", "Booking", "TutorWallet",
--     "TutorWalletLedger", "TokenLedger", or any other existing table.
--
-- Wraps everything in a single transaction so failures roll back cleanly.
-- The script ends with COMMIT.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Seed lots from current wallet balances
-- ----------------------------------------------------------------------------
-- For each TutorTokenBalance with balance > 0, create one "seed" lot capturing
-- the student's current holding at the wallet's current pricePerToken. This is
-- the lot that future bookings will drain FIFO.
--
-- purchasedAt = oldest PURCHASED ledger entry for this (student, tutor) pair
-- (so it sorts correctly in FIFO order against any future purchases).
-- expiresAt   = expiresAt from that same ledger row (preserves 60-day window).
-- ----------------------------------------------------------------------------

INSERT INTO "TutorTokenLot" (
  id, "studentId", "tutorId", "pricePerToken",
  "initialQty", "remainingQty", "paymentId", "sourceLotId",
  "purchasedAt", "expiresAt", "createdAt", "updatedAt"
)
SELECT
  'seed_' || ttb.id AS id,
  ttb."studentId",
  ttb."tutorId",
  ttb."pricePerToken",
  ttb.balance       AS "initialQty",
  ttb.balance       AS "remainingQty",
  NULL              AS "paymentId",
  NULL              AS "sourceLotId",
  COALESCE(
    (SELECT MIN(tl."createdAt")
       FROM "TokenLedger" tl
      WHERE tl."studentId" = ttb."studentId"
        AND tl."tutorId"   = ttb."tutorId"
        AND tl.reason::text = 'PURCHASED'),
    NOW()
  ) AS "purchasedAt",
  (SELECT tl."expiresAt"
     FROM "TokenLedger" tl
    WHERE tl."studentId" = ttb."studentId"
      AND tl."tutorId"   = ttb."tutorId"
      AND tl.reason::text = 'PURCHASED'
      AND tl."expiresAt" IS NOT NULL
    ORDER BY tl."createdAt" DESC
    LIMIT 1) AS "expiresAt",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM "TutorTokenBalance" ttb
WHERE ttb.balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM "TutorTokenLot" tl WHERE tl.id = 'seed_' || ttb.id
  );

-- ----------------------------------------------------------------------------
-- STEP 2: Per-booking historical lots + consumption rows
-- ----------------------------------------------------------------------------
-- For each Booking with tokensCharged > 0 we record:
--   (a) a synthetic "historical" lot at the booking's priceAtBooking
--       (initialQty = remainingQty = 0 — purely a price anchor, NOT a balance)
--   (b) one BookingLotConsumption row pointing at that historical lot
--
-- Bookings whose priceAtBooking is NULL are skipped (cannot infer price).
-- COMPLETED bookings get rows too so earnings reconciliation can use them, but
-- existing TutorWalletLedger BOOKING_EARNED rows are NOT modified.
-- ----------------------------------------------------------------------------

-- 2a: historical lots (one per booking with tokens charged)
INSERT INTO "TutorTokenLot" (
  id, "studentId", "tutorId", "pricePerToken",
  "initialQty", "remainingQty", "paymentId", "sourceLotId",
  "purchasedAt", "expiresAt", "createdAt", "updatedAt"
)
SELECT
  'hist_' || b.id AS id,
  b."studentId",
  b."tutorId",
  b."priceAtBooking",
  0::numeric AS "initialQty",
  0::numeric AS "remainingQty",
  NULL       AS "paymentId",
  NULL       AS "sourceLotId",
  b."createdAt" AS "purchasedAt",
  NULL          AS "expiresAt",
  NOW(), NOW()
FROM "Booking" b
WHERE b."tokensCharged" > 0
  AND b."priceAtBooking" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TutorTokenLot" tl WHERE tl.id = 'hist_' || b.id
  );

-- 2b: consumption rows
INSERT INTO "BookingLotConsumption" (
  id, "bookingId", "lotId", qty, "pricePerToken", reversed, "createdAt"
)
SELECT
  'cons_' || b.id AS id,
  b.id            AS "bookingId",
  'hist_' || b.id AS "lotId",
  b."tokensCharged" AS qty,
  b."priceAtBooking" AS "pricePerToken",
  FALSE AS reversed,
  b."createdAt"
FROM "Booking" b
WHERE b."tokensCharged" > 0
  AND b."priceAtBooking" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BookingLotConsumption" blc
     WHERE blc."bookingId" = b.id
  );

-- ----------------------------------------------------------------------------
-- Verification
-- ----------------------------------------------------------------------------
\echo --- Seed lots created (one per non-empty wallet) ---
SELECT COUNT(*) AS seed_lots,
       SUM("remainingQty") AS total_tokens_in_seed_lots
  FROM "TutorTokenLot"
 WHERE id LIKE 'seed_%';

\echo --- Historical lots + consumption rows ---
SELECT COUNT(*) AS hist_lots FROM "TutorTokenLot" WHERE id LIKE 'hist_%';
SELECT COUNT(*) AS consumption_rows FROM "BookingLotConsumption";

\echo --- Sanity: each wallet has exactly one seed lot ---
SELECT
  ttb."studentId", ttb."tutorId",
  ttb.balance AS wallet_balance,
  ttb."pricePerToken" AS wallet_price,
  tl."remainingQty" AS lot_remaining,
  tl."pricePerToken" AS lot_price
FROM "TutorTokenBalance" ttb
LEFT JOIN "TutorTokenLot" tl ON tl.id = 'seed_' || ttb.id
WHERE ttb.balance > 0
ORDER BY ttb."studentId", ttb."tutorId";

COMMIT;
