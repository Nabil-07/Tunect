-- Approve all tutors (use this to fix the "Tutor not approved" error)
UPDATE "Tutor" 
SET status = 'APPROVED' 
WHERE status = 'PENDING';

-- Verify the update
SELECT u.email, u.role, t.status, t.id as tutor_id
FROM "User" u
INNER JOIN "Tutor" t ON u.id = t."userId"
WHERE u.role = 'TUTOR';
