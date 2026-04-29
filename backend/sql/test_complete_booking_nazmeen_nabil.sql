-- ============================================================================
-- TEST: Mark one of Nazmeen's bookings with Nabil as COMPLETED and credit the
-- tutor wallet. Lets you verify that priceAtBooking = ₹499 (locked at booking
-- creation when nazmeen's wallet pricePerToken was 499) drives the earning,
-- NOT the tutor's new ₹1000 hourlyRate.
--
-- Student tokens are already deducted at booking creation; this script does
-- NOT decrement them again (deducting twice would corrupt the wallet).
--
-- Wrap in a transaction so you can ROLLBACK if anything looks wrong.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0: Snapshot CURRENT state (before completion)
-- ─────────────────────────────────────────────────────────────────────────────
\echo '─── Tutor (Nabil) hourlyRate ───'
SELECT t.id AS tutor_id, t."hourlyRate"
FROM "Tutor" t
JOIN "User"  u ON u.id = t."userId"
WHERE u.email = 'nabil.irshad@tunectnow.com';

\echo '─── Student (Nazmeen) wallet with Nabil ───'
SELECT ttb."studentId", ttb."tutorId", ttb.balance, ttb."pricePerToken"
FROM "TutorTokenBalance" ttb
JOIN "Student" s ON s.id = ttb."studentId"
JOIN "User"    su ON su.id = s."userId"
JOIN "Tutor"   t ON t.id = ttb."tutorId"
JOIN "User"    tu ON tu.id = t."userId"
WHERE su.email = 'nazmeen.rahman@tunectnow.com'
  AND tu.email = 'nabil.irshad@tunectnow.com';

\echo '─── Tutor wallet balance BEFORE ───'
SELECT tw.balance
FROM "TutorWallet" tw
JOIN "Tutor" t ON t.id = tw."tutorId"
JOIN "User"  u ON u.id = t."userId"
WHERE u.email = 'nabil.irshad@tunectnow.com';

\echo '─── Eligible CONFIRMED bookings between this pair ───'
SELECT b.id, b.status, b."priceAtBooking", b."tokensCharged", b."startTime", b."endTime"
FROM "Booking" b
JOIN "Student" s ON s.id = b."studentId"
JOIN "User"    su ON su.id = s."userId"
JOIN "Tutor"   t ON t.id = b."tutorId"
JOIN "User"    tu ON tu.id = t."userId"
WHERE su.email = 'nazmeen.rahman@tunectnow.com'
  AND tu.email = 'nabil.irshad@tunectnow.com'
  AND b.status = 'CONFIRMED'
  AND b."isDemo" = false
ORDER BY b."startTime" ASC;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Pick the OLDEST CONFIRMED booking and capture its details into a
-- temp table so the rest of the script is idempotent within this transaction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _pick ON COMMIT DROP AS
SELECT
    b.id                AS booking_id,
    b."tutorId"         AS tutor_id,
    b."studentId"       AS student_id,
    b."priceAtBooking"  AS price_at_booking,
    b."tokensCharged"   AS tokens_charged,
    b."startTime"       AS start_time,
    b."endTime"         AS end_time
FROM "Booking" b
JOIN "Student" s ON s.id = b."studentId"
JOIN "User"    su ON su.id = s."userId"
JOIN "Tutor"   t ON t.id = b."tutorId"
JOIN "User"    tu ON tu.id = t."userId"
WHERE su.email = 'nazmeen.rahman@tunectnow.com'
  AND tu.email = 'nabil.irshad@tunectnow.com'
  AND b.status = 'CONFIRMED'
  AND b."isDemo" = false
ORDER BY b."startTime" ASC
LIMIT 1;

\echo '─── Booking selected for completion ───'
SELECT * FROM _pick;

-- Abort if no eligible booking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _pick) THEN
        RAISE EXCEPTION 'No CONFIRMED booking found between Nazmeen and Nabil. Create one in the app first.';
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Backdate the booking into the past (so completion is realistic)
-- and ensure a 1-hour duration. Only adjusts if startTime is in the future.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "Booking" b
SET    "startTime" = now() - interval '90 minutes',
       "endTime"   = now() - interval '30 minutes'
FROM   _pick p
WHERE  b.id = p.booking_id
  AND  (b."startTime" IS NULL OR b."startTime" > now());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Create / update BookingAttendance so attendance is verified
-- (tutorJoinCount > 0 AND studentJoinCount > 0 — required by tutor earnings
-- aggregation in tutors.service.ts and tutor-wallet.service.ts).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "BookingAttendance" (
    id, "bookingId",
    "tutorWaitingRoomAttended", "studentWaitingRoomAttended",
    "tutorJoinCount", "tutorFirstJoinedAt", "tutorLastJoinedAt",
    "studentJoinCount", "studentFirstJoinedAt", "studentLastJoinedAt",
    "classStartedAt", "classEndedAt", "createdAt"
)
SELECT
    'att_' || p.booking_id,
    p.booking_id,
    true, true,
    1, p.start_time, p.start_time,
    1, p.start_time, p.start_time,
    p.start_time, p.end_time, now()
FROM _pick p
ON CONFLICT ("bookingId") DO UPDATE
SET "tutorJoinCount"            = GREATEST("BookingAttendance"."tutorJoinCount", 1),
    "studentJoinCount"          = GREATEST("BookingAttendance"."studentJoinCount", 1),
    "tutorWaitingRoomAttended"  = true,
    "studentWaitingRoomAttended"= true,
    "tutorFirstJoinedAt"        = COALESCE("BookingAttendance"."tutorFirstJoinedAt", EXCLUDED."tutorFirstJoinedAt"),
    "studentFirstJoinedAt"      = COALESCE("BookingAttendance"."studentFirstJoinedAt", EXCLUDED."studentFirstJoinedAt"),
    "classStartedAt"            = COALESCE("BookingAttendance"."classStartedAt", EXCLUDED."classStartedAt"),
    "classEndedAt"              = COALESCE("BookingAttendance"."classEndedAt", EXCLUDED."classEndedAt");


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Flip the booking to COMPLETED
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "Booking" b
SET    status = 'COMPLETED'
FROM   _pick p
WHERE  b.id = p.booking_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Compute tutor earning EXACTLY as bookings.service.ts does on
-- completion:
--   hours       = (endTime - startTime) in hours, fallback to tokensCharged
--   feePercent  = 25 (rate<400) | 22 (rate<700) | 18 (rate>=700)
--   earned      = hours * priceAtBooking * (100 - feePercent) / 100
--
-- For priceAtBooking = 499 → feePercent = 22 → 1h × 499 × 0.78 = 389.22
-- (which is what your earnings page shows for past completed sessions).
-- ─────────────────────────────────────────────────────────────────────────────
WITH calc AS (
    SELECT
        p.booking_id,
        p.tutor_id,
        p.price_at_booking AS rate,
        CASE
            WHEN p.start_time IS NOT NULL AND p.end_time IS NOT NULL
                 AND p.end_time > p.start_time
                THEN EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 3600.0
            ELSE NULLIF(p.tokens_charged, 0)::numeric
        END AS hours,
        CASE
            WHEN p.price_at_booking <  400 THEN 25
            WHEN p.price_at_booking <  700 THEN 22
            ELSE                                18
        END AS fee_percent
    FROM _pick p
)
INSERT INTO "TutorWalletLedger" (id, "tutorId", "bookingId", delta, reason, note, "createdAt")
SELECT
    'wl_' || c.booking_id,
    c.tutor_id,
    c.booking_id,
    ROUND((c.hours * c.rate * (100 - c.fee_percent) / 100)::numeric, 2),
    'BOOKING_EARNED',
    'Completed booking ' || c.booking_id ||
        ' (rate: ₹' || c.rate ||
        '/hr, fee: ' || c.fee_percent ||
        '%, earned: ₹' || ROUND((c.hours * c.rate * (100 - c.fee_percent) / 100)::numeric, 2) || ')',
    now()
FROM calc c
ON CONFLICT ("tutorId", "bookingId", reason) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Credit TutorWallet by the same amount (if the ledger row was new)
-- ─────────────────────────────────────────────────────────────────────────────
WITH new_ledger AS (
    SELECT l."tutorId", l.delta
    FROM "TutorWalletLedger" l
    JOIN _pick p ON p.booking_id = l."bookingId"
    WHERE l.reason = 'BOOKING_EARNED'
      AND l.id     = 'wl_' || p.booking_id
)
INSERT INTO "TutorWallet" ("tutorId", balance, "updatedAt")
SELECT "tutorId", delta, now() FROM new_ledger
ON CONFLICT ("tutorId") DO UPDATE
SET balance     = "TutorWallet".balance + EXCLUDED.balance,
    "updatedAt" = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Final verification snapshot
-- ─────────────────────────────────────────────────────────────────────────────
\echo '─── Booking AFTER ───'
SELECT b.id, b.status, b."priceAtBooking", b."startTime", b."endTime"
FROM "Booking" b
JOIN _pick p ON p.booking_id = b.id;

\echo '─── BOOKING_EARNED ledger entry ───'
SELECT l.id, l.delta, l.reason, l.note
FROM "TutorWalletLedger" l
JOIN _pick p ON p.booking_id = l."bookingId"
WHERE l.reason = 'BOOKING_EARNED';

\echo '─── Tutor wallet balance AFTER ───'
SELECT tw.balance
FROM "TutorWallet" tw
JOIN "Tutor" t ON t.id = tw."tutorId"
JOIN "User"  u ON u.id = t."userId"
WHERE u.email = 'nabil.irshad@tunectnow.com';

\echo '─── EXPECTED at price 499 / 22% fee / 1h: delta ≈ ₹389.22 ───'
\echo '─── If priceAtBooking had wrongly been 1000 (18% fee), it would be ₹820.00 ───'


-- ─────────────────────────────────────────────────────────────────────────────
-- COMMIT to apply, ROLLBACK to discard. Default = ROLLBACK so you can dry-run.
-- Change to COMMIT once verified.
-- ─────────────────────────────────────────────────────────────────────────────
ROLLBACK;
-- COMMIT;
