INSERT INTO "User" (id, email, password, role, name, "hasChosenRole", "createdAt", "updatedAt")
VALUES (
  'admin_nabil_001',
  'nabil.irshad@example.com',
  '$2b$10$dCBWTk0CB9MLB1H/C0/equrag2TxPZES5C.87wru6TFhgDnephWyW',
  'ADMIN',
  'Nabil Irshad',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  role = 'ADMIN',
  "updatedAt" = NOW();
