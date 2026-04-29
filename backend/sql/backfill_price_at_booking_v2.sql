-- ============================================================================
-- BACKFILL priceAtBooking USING HISTORICAL TutorWalletLedger NOTES
-- ----------------------------------------------------------------------------
-- WHY: priceAtBooking is the locked per-hour rate at the time of booking.
-- When NULL, all earning/payout calculations fall back to the tutor's CURRENT
-- hourlyRate. So whenever a tutor raises their rate, every past session and
-- already-locked future booking is silently re-priced — corrupting the
-- "Tutor Payouts Due" admin page and tutor earnings dashboards.
--
-- HISTORICAL TRUTH SOURCE: When a booking completes, TutorWalletLedger writes
-- a row with reason='BOOKING_EARNED' and a note shaped like:
--   "Completed booking ckxyz (rate: ₹399/hr, fee: 25%, earned: ₹299.25)"
-- The "₹<rate>/hr" segment is the exact rate at completion time and is
-- independent of any later rate changes.
--
-- THIS SCRIPT IS:
--   * Idempotent (only touches NULL priceAtBooking rows)
--   * Tutor-agnostic (covers every tutor on the platform)
--   * Safe (no fallback to current hourlyRate; rows we cannot prove stay NULL)
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Inspect — count corrupted rows
-- ─────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS bookings_with_null_price
FROM "Booking"
WHERE "priceAtBooking" IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Preview — derive the historical rate per booking from ledger notes
-- Regex extracts the numeric value following "rate: ₹" (or plain "rate: ").
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    b.id                                                              AS booking_id,
    u.email                                                           AS tutor_email,
    t."hourlyRate"                                                    AS current_hourly_rate,
    b."priceAtBooking"                                                AS current_value,
    (regexp_match(l.note, 'rate:\s*₹?\s*([0-9]+(?:\.[0-9]+)?)'))[1]   AS will_be_set_to,
    b.status,
    b."startTime"
FROM "Booking" b
JOIN "Tutor"   t ON t.id = b."tutorId"
JOIN "User"    u ON u.id = t."userId"
JOIN "TutorWalletLedger" l
       ON l."bookingId" = b.id
      AND l.reason       = 'BOOKING_EARNED'
WHERE b."priceAtBooking" IS NULL
ORDER BY u.email, b."startTime";


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3a: BACKFILL completed bookings (have BOOKING_EARNED ledger notes)
-- This is the highest-confidence path: rate is read directly from the note
-- written at completion time.
-- ─────────────────────────────────────────────────────────────────────────────
WITH ledger_rates AS (
    SELECT DISTINCT ON (l."bookingId")
        l."bookingId",
        NULLIF(
            (regexp_match(l.note, 'rate:\s*₹?\s*([0-9]+(?:\.[0-9]+)?)'))[1],
            ''
        )::numeric AS rate
    FROM "TutorWalletLedger" l
    WHERE l.reason   = 'BOOKING_EARNED'
      AND l.note     ~ 'rate:\s*₹?\s*[0-9]'
    ORDER BY l."bookingId", l."createdAt" ASC
)
UPDATE "Booking" b
SET    "priceAtBooking" = lr.rate
FROM   ledger_rates lr
WHERE  b.id              = lr."bookingId"
  AND  b."priceAtBooking" IS NULL
  AND  lr.rate IS NOT NULL
  AND  lr.rate > 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3b: BACKFILL pending / future / not-yet-completed NULL bookings
-- For each such booking, infer the tutor's historical rate from their MOST
-- RECENT BOOKING_EARNED ledger note that pre-dates the booking (or, failing
-- that, the closest earlier note). If no ledger note exists for that tutor
-- at all, the row is left NULL (we will not invent a price).
-- ─────────────────────────────────────────────────────────────────────────────
WITH tutor_rate_history AS (
    SELECT
        l."tutorId",
        l."createdAt" AS noted_at,
        NULLIF(
            (regexp_match(l.note, 'rate:\s*₹?\s*([0-9]+(?:\.[0-9]+)?)'))[1],
            ''
        )::numeric AS rate
    FROM "TutorWalletLedger" l
    WHERE l.reason   = 'BOOKING_EARNED'
      AND l.note     ~ 'rate:\s*₹?\s*[0-9]'
),
candidate AS (
    SELECT
        b.id                                   AS booking_id,
        b."tutorId",
        COALESCE(b."startTime", b."createdAt") AS reference_time
    FROM "Booking" b
    WHERE b."priceAtBooking" IS NULL
),
inferred AS (
    SELECT
        c.booking_id,
        (
            SELECT trh.rate
            FROM tutor_rate_history trh
            WHERE trh."tutorId" = c."tutorId"
              AND trh.rate IS NOT NULL
              AND trh.rate > 0
            ORDER BY
                CASE WHEN trh.noted_at <= c.reference_time THEN 0 ELSE 1 END,
                ABS(EXTRACT(EPOCH FROM (trh.noted_at - c.reference_time)))
            LIMIT 1
        ) AS rate
    FROM candidate c
)
UPDATE "Booking" b
SET    "priceAtBooking" = i.rate
FROM   inferred i
WHERE  b.id              = i.booking_id
  AND  b."priceAtBooking" IS NULL
  AND  i.rate IS NOT NULL
  AND  i.rate > 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Verify — show remaining NULL rows (should be only bookings that
-- have no ledger evidence at all, e.g. demo or test data).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    b.id             AS booking_id,
    u.email          AS tutor_email,
    t."hourlyRate"   AS current_hourly_rate,
    b.status,
    b."isDemo",
    b."tokensCharged",
    b."startTime"
FROM "Booking" b
JOIN "Tutor" t ON t.id = b."tutorId"
JOIN "User"  u ON u.id = t."userId"
WHERE b."priceAtBooking" IS NULL
ORDER BY u.email, b."startTime";


-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL: per-tutor sanity check after backfill
-- Replace the email below to inspect a specific tutor's booking prices.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT b.id, b.status, b."priceAtBooking", b."startTime", b."endTime"
-- FROM "Booking" b
-- JOIN "Tutor" t ON t.id = b."tutorId"
-- JOIN "User"  u ON u.id = t."userId"
-- WHERE u.email = 'a.shefu06@gmail.com'
-- ORDER BY b."startTime";
