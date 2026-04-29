-- Identify the booking that admin counts but the tutor's earnings page does not.
-- Replace the email if you want a different tutor.
SELECT
    b.id,
    b.status,
    b."isDemo",
    b."tokensCharged",
    b."priceAtBooking",
    b."startTime",
    b."endTime",
    -- Why admin includes it:
    CASE
        WHEN b.status = 'COMPLETED'                       THEN 'COMPLETED'
        WHEN b.status = 'AUTO_CANCELLED_STUDENT_NO_SHOW'  THEN 'NO_SHOW (admin counts as payable)'
        WHEN b.status = 'CONFIRMED' AND b."endTime" < now() THEN 'CONFIRMED but endTime passed (cron not run yet)'
        ELSE 'other'
    END AS admin_inclusion_reason,
    -- Why tutor excludes it:
    CASE
        WHEN b.status <> 'COMPLETED' THEN 'status != COMPLETED'
        WHEN COALESCE(att."tutorJoinCount", 0) = 0
          OR COALESCE(att."studentJoinCount", 0) = 0
              THEN 'attendance not verified (one party never joined)'
        ELSE 'should be in tutor earnings'
    END AS tutor_exclusion_reason,
    att."tutorJoinCount",
    att."studentJoinCount"
FROM "Booking" b
JOIN "Tutor" t ON t.id = b."tutorId"
JOIN "User"  u ON u.id = t."userId"
LEFT JOIN "Attendance" att ON att."bookingId" = b.id
WHERE u.email = 'nabil.irshad@tunectnow.com'
  AND b."isDemo"        = false
  AND b."tokensCharged" > 0
  AND (
        b.status IN ('COMPLETED', 'AUTO_CANCELLED_STUDENT_NO_SHOW')
     OR (b.status = 'CONFIRMED' AND b."endTime" < now())
  )
ORDER BY b."endTime" DESC NULLS LAST;
