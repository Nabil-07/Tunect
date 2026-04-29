-- ============================================================================
-- TEST: FIFO Token Lot system end-to-end simulation
--
-- Scenario (per user request):
--   Nazmeen Rahman has 34 tokens with Nabil Irshad at ₹499/token (legacy lot).
--   Nabil's current hourlyRate is ₹1000.
--
--   STEP A: Drain wallet down to 1 remaining ₹499 token (simulates 33 prior
--           completed bookings).
--   STEP B: Nazmeen purchases 5 new tokens at ₹1000 (current rate).
--   STEP C: Nazmeen books a 1-hour class with Nabil. FIFO must consume the
--           leftover ₹499 token (NOT the newer ₹1000 lot). Booking is
--           completed; tutor earns ₹499 × (1 - 22%) = ₹389.22.
--   STEP D: Nazmeen books another 1-hour class. FIFO drains 1 from the new
--           ₹1000 lot. Earning = ₹1000 × (1 - 18%) = ₹820.
--   STEP E: Nazmeen cancels Booking D fully → 1 token must be restored to
--           the ₹1000 lot at the original price.
--
-- Wrapped in BEGIN ... ROLLBACK so the script is fully reversible. Flip the
-- last line to COMMIT once you've reviewed the output.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Resolve actor IDs into a temp table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _actors ON COMMIT DROP AS
SELECT
    s.id  AS student_id,
    su.id AS student_user_id,
    t.id  AS tutor_id,
    tu.id AS tutor_user_id,
    t."hourlyRate" AS tutor_hourly_rate
FROM "Student" s
JOIN "User" su ON su.id = s."userId"
JOIN "Tutor"   t  ON t.id  = (
    SELECT t2.id FROM "Tutor" t2
    JOIN "User" tu2 ON tu2.id = t2."userId"
    WHERE tu2.email = 'nabil.irshad@tunectnow.com' LIMIT 1
)
JOIN "User"    tu ON tu.id = t."userId"
WHERE su.email = 'nazmeen.rahman@tunectnow.com';

\echo '─── Actors ───'
SELECT * FROM _actors;

-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-state snapshot
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' BEFORE: wallet, active lots, tutor wallet'
\echo '════════════════════════════════════════════════════════════════════════'

SELECT 'wallet'::text AS k, ttb.balance, ttb."pricePerToken"
FROM "TutorTokenBalance" ttb, _actors a
WHERE ttb."studentId" = a.student_id AND ttb."tutorId" = a.tutor_id;

SELECT 'lot'::text AS k, l.id, l."pricePerToken", l."remainingQty", l."expiresAt"
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND l."remainingQty" > 0
ORDER BY l."purchasedAt", l."createdAt";

SELECT 'tutor_wallet'::text AS k, tw.balance
FROM "TutorWallet" tw, _actors a
WHERE tw."tutorId" = a.tutor_id;


-- ============================================================================
-- STEP A: Drain wallet from 34 → 1 token (simulate 33 prior completed bookings)
--   This mirrors what would have happened if 33 historical bookings drained
--   the lot. We just adjust the data directly to set up the test scenario.
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' STEP A: drain wallet 34 → 1 (simulate prior usage)'
\echo '════════════════════════════════════════════════════════════════════════'

UPDATE "TutorTokenBalance"
SET balance = 1
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

UPDATE "TutorTokenLot"
SET "remainingQty" = 1
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors)
  AND "remainingQty" > 0;

SELECT 'wallet_after_A'::text AS k, balance, "pricePerToken"
FROM "TutorTokenBalance"
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

SELECT 'lots_after_A'::text AS k, l.id, l."pricePerToken", l."remainingQty"
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND l."remainingQty" > 0
ORDER BY l."purchasedAt";


-- ============================================================================
-- STEP B: Nazmeen purchases 5 new tokens at ₹1000 (Nabil's current rate)
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' STEP B: purchase 5 tokens @ ₹1000'
\echo '════════════════════════════════════════════════════════════════════════'

-- Synthetic Payment row (simulates a successful Razorpay capture)
INSERT INTO "Payment" (id, "userId", provider, "amountInMinor", currency,
                       status, "tokensPurchased", "createdAt", "updatedAt", metadata)
SELECT
    'test_pay_'  || md5(random()::text || clock_timestamp()::text)::text,
    a.student_user_id,
    'RAZORPAY'::"PaymentProvider",
    500000,                  -- 5 × ₹1000 = ₹5000 → minor units
    'INR',
    'SUCCEEDED'::"PaymentStatus",
    5,
    NOW(), NOW(),
    jsonb_build_object('test_scenario', 'fifo_case2', 'pricePerToken', 1000)
FROM _actors a
RETURNING id AS new_payment_id;

-- Capture into temp table for later steps
CREATE TEMP TABLE _new_payment ON COMMIT DROP AS
SELECT id AS payment_id FROM "Payment"
WHERE metadata->>'test_scenario' = 'fifo_case2'
ORDER BY "createdAt" DESC LIMIT 1;

-- Append a new TutorTokenLot at ₹1000 with 60-day expiry
INSERT INTO "TutorTokenLot" (
    id, "studentId", "tutorId", "pricePerToken", "initialQty", "remainingQty",
    "paymentId", "purchasedAt", "expiresAt", "createdAt", "updatedAt"
)
SELECT
    'test_lot_1000_' || md5(random()::text || clock_timestamp()::text),
    a.student_id, a.tutor_id,
    1000.00, 5.00, 5.00,
    p.payment_id,
    NOW(), NOW() + INTERVAL '60 days',
    NOW(), NOW()
FROM _actors a, _new_payment p;

-- Wallet balance increments by 5; legacy pricePerToken on TutorTokenBalance
-- updates to current rate (display-only field)
UPDATE "TutorTokenBalance"
SET balance = balance + 5,
    "pricePerToken" = 1000.00
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

-- TokenLedger entry
INSERT INTO "TokenLedger" ("id","studentId","tutorId","delta","reason","paymentId","createdAt")
SELECT
    'test_tl_purchase_' || md5(random()::text || clock_timestamp()::text),
    a.student_id, a.tutor_id,
    5.00, 'PURCHASED'::"TokenReason",
    p.payment_id,
    NOW()
FROM _actors a, _new_payment p;

\echo '── lots after purchase (FIFO order) ──'
SELECT l.id, l."pricePerToken", l."remainingQty", l."purchasedAt"
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND l."remainingQty" > 0
ORDER BY l."purchasedAt", l."createdAt";

\echo '── wallet after purchase ──'
SELECT balance, "pricePerToken"
FROM "TutorTokenBalance"
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);


-- ============================================================================
-- STEP C: Booking #1 — drains the leftover ₹499 token (FIFO oldest first)
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' STEP C: Booking #1 (FIFO must drain ₹499 lot)'
\echo '════════════════════════════════════════════════════════════════════════'

-- Pick the oldest non-expired lot with remainingQty > 0 (= the ₹499 lot)
CREATE TEMP TABLE _drain_c ON COMMIT DROP AS
SELECT l.id AS lot_id, l."pricePerToken" AS price_per_token
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND l."remainingQty" > 0
  AND (l."expiresAt" IS NULL OR l."expiresAt" > NOW())
ORDER BY l."purchasedAt" ASC, l."createdAt" ASC
LIMIT 1;

-- Create the booking (status CONFIRMED, will be completed below)
CREATE TEMP TABLE _bk_c ON COMMIT DROP AS
SELECT 'test_bk_c_' || md5(random()::text || clock_timestamp()::text) AS booking_id;

INSERT INTO "Booking" (
    id, "tutorId", "studentId", "startTime", "endTime", status,
    "isDemo", "tokensCharged", "priceAtBooking", "createdAt", "updatedAt"
)
SELECT
    bk.booking_id, a.tutor_id, a.student_id,
    NOW() - INTERVAL '2 hours',  -- start
    NOW() - INTERVAL '1 hour',   -- end (1 hour duration, in the past)
    'CONFIRMED'::"BookingStatus",
    false,
    1.00,
    d.price_per_token,           -- locked at ₹499 from lot drain
    NOW(), NOW()
FROM _actors a, _bk_c bk, _drain_c d;

-- Drain the lot (decrement remainingQty, write consumption row)
UPDATE "TutorTokenLot"
SET "remainingQty" = "remainingQty" - 1, "updatedAt" = NOW()
WHERE id = (SELECT lot_id FROM _drain_c);

INSERT INTO "BookingLotConsumption" ("id","bookingId","lotId","qty","pricePerToken","reversed","createdAt")
SELECT
    'test_blc_c_' || md5(random()::text || clock_timestamp()::text),
    bk.booking_id, d.lot_id,
    1.00, d.price_per_token,
    false, NOW()
FROM _bk_c bk, _drain_c d;

-- Decrement wallet balance
UPDATE "TutorTokenBalance"
SET balance = balance - 1
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

-- TokenLedger SPEND
INSERT INTO "TokenLedger" ("id","studentId","tutorId","bookingId","delta","reason","createdAt")
SELECT
    'test_tl_spend_c_' || md5(random()::text || clock_timestamp()::text),
    a.student_id, a.tutor_id, bk.booking_id,
    -1.00, 'BOOKING'::"TokenReason", NOW()
FROM _actors a, _bk_c bk;

\echo '── consumption row for Booking C (expect lot=₹499) ──'
SELECT blc."bookingId", blc."lotId", blc.qty, blc."pricePerToken", blc.reversed,
       l."pricePerToken" AS lot_price
FROM "BookingLotConsumption" blc
JOIN "TutorTokenLot" l ON l.id = blc."lotId"
WHERE blc."bookingId" = (SELECT booking_id FROM _bk_c);

\echo '── lots after Booking C drain (₹499 lot should be 0, ₹1000 lot still 5) ──'
SELECT l.id, l."pricePerToken", l."remainingQty"
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
ORDER BY l."purchasedAt" DESC LIMIT 5;

-- ── Now COMPLETE Booking C and credit tutor ──
\echo ''
\echo '── COMPLETE Booking C, credit tutor ──'

-- Earnings: 1 × 499 × (1 - 22%) = 389.22 (rate is 400-699 tier on lot price)
-- NOTE: platformFeePercent uses the lot pricePerToken (not tutor.hourlyRate).
-- 499 → 22% fee tier → tutor share 78% = 389.22
CREATE TEMP TABLE _earn_c ON COMMIT DROP AS
SELECT
    SUM(blc.qty * blc."pricePerToken") AS gross,
    SUM(blc.qty * blc."pricePerToken" *
        CASE WHEN blc."pricePerToken" < 400 THEN 0.25
             WHEN blc."pricePerToken" < 700 THEN 0.22
             ELSE 0.18 END) AS fee,
    SUM(blc.qty * blc."pricePerToken" *
        (1 - CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                  WHEN blc."pricePerToken" < 700 THEN 0.22
                  ELSE 0.18 END)) AS tutor_share
FROM "BookingLotConsumption" blc
WHERE blc."bookingId" = (SELECT booking_id FROM _bk_c)
  AND blc.reversed = false;

SELECT 'earn_c'::text AS k, gross, fee, tutor_share FROM _earn_c;

UPDATE "Booking" SET status = 'COMPLETED'::"BookingStatus", "updatedAt" = NOW()
WHERE id = (SELECT booking_id FROM _bk_c);

-- Credit TutorWallet
UPDATE "TutorWallet" SET balance = balance + (SELECT tutor_share FROM _earn_c), "updatedAt" = NOW()
WHERE "tutorId" = (SELECT tutor_id FROM _actors);

-- Wallet ledger
INSERT INTO "TutorWalletLedger" ("id","tutorId","bookingId","delta","reason","note","createdAt")
SELECT
    'test_twl_c_' || md5(random()::text || clock_timestamp()::text),
    a.tutor_id, bk.booking_id,
    e.tutor_share, 'BOOKING_EARNED'::"WalletReason",
    'test booking completed, source: lots',
    NOW()
FROM _actors a, _bk_c bk, _earn_c e;

\echo '── tutor wallet after Booking C (should be +389.22) ──'
SELECT balance FROM "TutorWallet" WHERE "tutorId" = (SELECT tutor_id FROM _actors);


-- ============================================================================
-- STEP D: Booking #2 — drains 1 from the new ₹1000 lot
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' STEP D: Booking #2 (drains ₹1000 lot, 5 → 4)'
\echo '════════════════════════════════════════════════════════════════════════'

CREATE TEMP TABLE _drain_d ON COMMIT DROP AS
SELECT l.id AS lot_id, l."pricePerToken" AS price_per_token
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND l."remainingQty" > 0
  AND (l."expiresAt" IS NULL OR l."expiresAt" > NOW())
ORDER BY l."purchasedAt" ASC, l."createdAt" ASC
LIMIT 1;

CREATE TEMP TABLE _bk_d ON COMMIT DROP AS
SELECT 'test_bk_d_' || md5(random()::text || clock_timestamp()::text) AS booking_id;

INSERT INTO "Booking" (
    id, "tutorId", "studentId", "startTime", "endTime", status,
    "isDemo", "tokensCharged", "priceAtBooking", "createdAt", "updatedAt"
)
SELECT
    bk.booking_id, a.tutor_id, a.student_id,
    NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours',
    'CONFIRMED'::"BookingStatus",
    false, 1.00, d.price_per_token, NOW(), NOW()
FROM _actors a, _bk_d bk, _drain_d d;

UPDATE "TutorTokenLot" SET "remainingQty" = "remainingQty" - 1, "updatedAt" = NOW()
WHERE id = (SELECT lot_id FROM _drain_d);

INSERT INTO "BookingLotConsumption" ("id","bookingId","lotId","qty","pricePerToken","reversed","createdAt")
SELECT
    'test_blc_d_' || md5(random()::text || clock_timestamp()::text),
    bk.booking_id, d.lot_id, 1.00, d.price_per_token, false, NOW()
FROM _bk_d bk, _drain_d d;

UPDATE "TutorTokenBalance" SET balance = balance - 1
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

INSERT INTO "TokenLedger" ("id","studentId","tutorId","bookingId","delta","reason","createdAt")
SELECT
    'test_tl_spend_d_' || md5(random()::text || clock_timestamp()::text),
    a.student_id, a.tutor_id, bk.booking_id, -1.00, 'BOOKING'::"TokenReason", NOW()
FROM _actors a, _bk_d bk;

-- COMPLETE: 1 × 1000 × (1 - 18%) = 820
CREATE TEMP TABLE _earn_d ON COMMIT DROP AS
SELECT
    SUM(blc.qty * blc."pricePerToken") AS gross,
    SUM(blc.qty * blc."pricePerToken" *
        CASE WHEN blc."pricePerToken" < 400 THEN 0.25
             WHEN blc."pricePerToken" < 700 THEN 0.22
             ELSE 0.18 END) AS fee,
    SUM(blc.qty * blc."pricePerToken" *
        (1 - CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                  WHEN blc."pricePerToken" < 700 THEN 0.22
                  ELSE 0.18 END)) AS tutor_share
FROM "BookingLotConsumption" blc
WHERE blc."bookingId" = (SELECT booking_id FROM _bk_d) AND blc.reversed = false;

SELECT 'earn_d'::text AS k, gross, fee, tutor_share FROM _earn_d;

UPDATE "Booking" SET status = 'COMPLETED'::"BookingStatus", "updatedAt" = NOW()
WHERE id = (SELECT booking_id FROM _bk_d);

UPDATE "TutorWallet" SET balance = balance + (SELECT tutor_share FROM _earn_d), "updatedAt" = NOW()
WHERE "tutorId" = (SELECT tutor_id FROM _actors);

INSERT INTO "TutorWalletLedger" ("id","tutorId","bookingId","delta","reason","note","createdAt")
SELECT
    'test_twl_d_' || md5(random()::text || clock_timestamp()::text),
    a.tutor_id, bk.booking_id, e.tutor_share, 'BOOKING_EARNED'::"WalletReason",
    'test booking completed, source: lots', NOW()
FROM _actors a, _bk_d bk, _earn_d e;

\echo '── tutor wallet after Booking D (should be +820 from C balance) ──'
SELECT balance FROM "TutorWallet" WHERE "tutorId" = (SELECT tutor_id FROM _actors);

\echo '── lots after both drains (₹499 lot=0, ₹1000 lot=4) ──'
SELECT l.id, l."pricePerToken", l."remainingQty"
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND (l.id = (SELECT lot_id FROM _drain_c) OR l.id = (SELECT lot_id FROM _drain_d))
ORDER BY l."pricePerToken";


-- ============================================================================
-- STEP E: REFUND test — cancel Booking D, restore 1 token to ₹1000 lot
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' STEP E: refund Booking D (full 1-token refund)'
\echo '════════════════════════════════════════════════════════════════════════'

-- Restore the lot via consumption row (LIFO; only 1 row exists for D)
UPDATE "TutorTokenLot"
SET "remainingQty" = "remainingQty" + 1, "updatedAt" = NOW()
WHERE id = (
    SELECT blc."lotId" FROM "BookingLotConsumption" blc
    WHERE blc."bookingId" = (SELECT booking_id FROM _bk_d) AND blc.reversed = false
);

UPDATE "BookingLotConsumption"
SET reversed = true
WHERE "bookingId" = (SELECT booking_id FROM _bk_d) AND reversed = false;

UPDATE "TutorTokenBalance"
SET balance = balance + 1
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

INSERT INTO "TokenLedger" ("id","studentId","tutorId","bookingId","delta","reason","createdAt")
SELECT
    'test_tl_refund_d_' || md5(random()::text || clock_timestamp()::text),
    a.student_id, a.tutor_id, bk.booking_id, 1.00, 'REFUND'::"TokenReason", NOW()
FROM _actors a, _bk_d bk;

UPDATE "Booking" SET status = 'CANCELED'::"BookingStatus", "updatedAt" = NOW()
WHERE id = (SELECT booking_id FROM _bk_d);

-- Reverse tutor earning for booking D (since it's no longer completed)
UPDATE "TutorWallet"
SET balance = balance - (SELECT tutor_share FROM _earn_d), "updatedAt" = NOW()
WHERE "tutorId" = (SELECT tutor_id FROM _actors);

INSERT INTO "TutorWalletLedger" ("id","tutorId","bookingId","delta","reason","note","createdAt")
SELECT
    'test_twl_refund_d_' || md5(random()::text || clock_timestamp()::text),
    a.tutor_id, bk.booking_id, -e.tutor_share, 'ADJUSTMENT'::"WalletReason",
    'test refund of booking D', NOW()
FROM _actors a, _bk_d bk, _earn_d e;

\echo '── consumption row for Booking D after refund (reversed should be true) ──'
SELECT blc."bookingId", blc."lotId", blc.qty, blc."pricePerToken", blc.reversed
FROM "BookingLotConsumption" blc
WHERE blc."bookingId" = (SELECT booking_id FROM _bk_d);

\echo '── lots after refund (₹1000 lot back to 5) ──'
SELECT l.id, l."pricePerToken", l."remainingQty"
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND (l.id = (SELECT lot_id FROM _drain_c) OR l.id = (SELECT lot_id FROM _drain_d))
ORDER BY l."pricePerToken";


-- ============================================================================
-- FINAL VALIDATIONS
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' FINAL STATE — assertions'
\echo '════════════════════════════════════════════════════════════════════════'

\echo '── 1. Student wallet should be 5 (1-1+5-1+1 = 5) ──'
SELECT balance FROM "TutorTokenBalance"
WHERE "studentId" = (SELECT student_id FROM _actors)
  AND "tutorId"   = (SELECT tutor_id   FROM _actors);

\echo '── 2. Sum of remainingQty across active lots should equal wallet (5) ──'
SELECT COALESCE(SUM(l."remainingQty"), 0) AS sum_remaining
FROM "TutorTokenLot" l, _actors a
WHERE l."studentId" = a.student_id AND l."tutorId" = a.tutor_id
  AND l."remainingQty" > 0;

\echo '── 3. Booking C (COMPLETED, ₹499 lot): earnings via consumption ──'
SELECT b.id, b.status, b."priceAtBooking",
       e.gross, e.fee, e.tutor_share
FROM "Booking" b, LATERAL (
    SELECT
        SUM(blc.qty * blc."pricePerToken") AS gross,
        SUM(blc.qty * blc."pricePerToken" *
            CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                 WHEN blc."pricePerToken" < 700 THEN 0.22
                 ELSE 0.18 END) AS fee,
        SUM(blc.qty * blc."pricePerToken" *
            (1 - CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                      WHEN blc."pricePerToken" < 700 THEN 0.22
                      ELSE 0.18 END)) AS tutor_share
    FROM "BookingLotConsumption" blc
    WHERE blc."bookingId" = b.id AND blc.reversed = false
) e
WHERE b.id = (SELECT booking_id FROM _bk_c);

\echo '── 4. Booking D (CANCELED, refund) — should yield 0 earnings ──'
SELECT b.id, b.status, b."priceAtBooking",
       COALESCE(e.gross, 0) AS gross,
       COALESCE(e.tutor_share, 0) AS tutor_share
FROM "Booking" b LEFT JOIN LATERAL (
    SELECT
        SUM(blc.qty * blc."pricePerToken") AS gross,
        SUM(blc.qty * blc."pricePerToken" *
            (1 - CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                      WHEN blc."pricePerToken" < 700 THEN 0.22
                      ELSE 0.18 END)) AS tutor_share
    FROM "BookingLotConsumption" blc
    WHERE blc."bookingId" = b.id AND blc.reversed = false
) e ON true
WHERE b.id = (SELECT booking_id FROM _bk_d);

\echo '── 5. Tutor wallet net change since start of script ──'
SELECT 'tutor_wallet_now'::text AS k, balance FROM "TutorWallet"
WHERE "tutorId" = (SELECT tutor_id FROM _actors);

\echo '── 6. TutorWalletLedger entries written by this test ──'
SELECT twl.delta, twl.reason, twl.note, twl."bookingId"
FROM "TutorWalletLedger" twl
WHERE twl."bookingId" IN ((SELECT booking_id FROM _bk_c), (SELECT booking_id FROM _bk_d))
ORDER BY twl."createdAt";

\echo '── 7. Admin revenue split (mimics revenueAnalytics calc) for these 2 bookings ──'
SELECT b.id AS booking_id, b.status,
       e.gross AS booking_amount,
       e.fee AS commission,
       e.tutor_share AS tutor_payout
FROM "Booking" b, LATERAL (
    SELECT
        COALESCE(SUM(blc.qty * blc."pricePerToken"), 0) AS gross,
        COALESCE(SUM(blc.qty * blc."pricePerToken" *
            CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                 WHEN blc."pricePerToken" < 700 THEN 0.22
                 ELSE 0.18 END), 0) AS fee,
        COALESCE(SUM(blc.qty * blc."pricePerToken" *
            (1 - CASE WHEN blc."pricePerToken" < 400 THEN 0.25
                      WHEN blc."pricePerToken" < 700 THEN 0.22
                      ELSE 0.18 END)), 0) AS tutor_share
    FROM "BookingLotConsumption" blc
    WHERE blc."bookingId" = b.id AND blc.reversed = false
) e
WHERE b.id IN ((SELECT booking_id FROM _bk_c), (SELECT booking_id FROM _bk_d))
ORDER BY b."createdAt";

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' Expected results:'
\echo '   Booking C (₹499): gross=499, fee=109.78, tutor_share=389.22 (22% tier)'
\echo '   Booking D (₹1000, refunded): rows reversed → gross=NULL, share=0'
\echo '   Tutor wallet net delta = +389.22 (only C; D was refunded)'
\echo '   ₹499 lot remainingQty = 0 (drained)'
\echo '   ₹1000 lot remainingQty = 5 (1 drained + 1 restored)'
\echo '   Student wallet = 5 tokens'
\echo '════════════════════════════════════════════════════════════════════════'

-- Default to ROLLBACK so the test is non-destructive. Flip to COMMIT to apply.
ROLLBACK;
