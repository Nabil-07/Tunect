-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Inspect — show bookings with NULL priceAtBooking for a given email
-- Replace 'nabil.irshad07@gmail.com' with any tutor email you want to check.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    b.id            AS booking_id,
    b."tutorId",
    u.email         AS tutor_email,
    t."hourlyRate"  AS current_hourly_rate,
    b."priceAtBooking",
    b.status,
    b."startTime",
    b."endTime",
    b."tokensCharged",
    b."createdAt"
FROM "Booking" b
JOIN "Tutor"   t ON t.id = b."tutorId"
JOIN "User"    u ON u.id = t."userId"
WHERE u.email = 'nabil.irshad07@gmail.com'
  AND b."priceAtBooking" IS NULL
ORDER BY b."createdAt";


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Preview — show what the backfill WOULD set (no writes yet)
-- For each NULL priceAtBooking booking, use the tutor's hourlyRate as the
-- locked-in price (best approximation for historical data).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    b.id            AS booking_id,
    u.email         AS tutor_email,
    b."priceAtBooking" AS current_value,
    t."hourlyRate"  AS will_be_set_to,
    b.status,
    b."startTime"
FROM "Booking" b
JOIN "Tutor"   t ON t.id = b."tutorId"
JOIN "User"    u ON u.id = t."userId"
WHERE u.email = 'nabil.irshad07@gmail.com'
  AND b."priceAtBooking" IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: BACKFILL — set priceAtBooking = tutor's hourlyRate for NULL rows
-- Only for the specific tutor email. Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "Booking" b
SET    "priceAtBooking" = t."hourlyRate"
FROM   "Tutor"  t
JOIN   "User"   u ON u.id = t."userId"
WHERE  b."tutorId"        = t.id
  AND  b."priceAtBooking" IS NULL
  AND  u.email            = 'nabil.irshad07@gmail.com';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Verify — confirm no NULL rows remain for this tutor
-- ─────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS still_null
FROM "Booking" b
JOIN "Tutor"   t ON t.id = b."tutorId"
JOIN "User"    u ON u.id = t."userId"
WHERE u.email = 'nabil.irshad07@gmail.com'
  AND b."priceAtBooking" IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL: FULL PLATFORM BACKFILL
-- Sets priceAtBooking = tutor's current hourlyRate for ALL bookings platform-wide
-- where it is still NULL. Run STEP 1 variant below first to see the count.
-- ─────────────────────────────────────────────────────────────────────────────

-- Count first:
-- SELECT COUNT(*) FROM "Booking" WHERE "priceAtBooking" IS NULL;

-- Then run backfill:
-- UPDATE "Booking" b
-- SET    "priceAtBooking" = t."hourlyRate"
-- FROM   "Tutor" t
-- WHERE  b."tutorId" = t.id
--   AND  b."priceAtBooking" IS NULL;
