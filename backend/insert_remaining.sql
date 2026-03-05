INSERT INTO _prisma_migrations (id, checksum, started_at, finished_at, migration_name, logs, rolled_back_at, applied_steps_count)
  SELECT '20250906000000_role_profile_cleanup', '47803fa31bf50fe122c7159da4c05f218ca669d6f0fcbc1815d2748aa5f17513', '2026-03-03T13:48:25.929Z', '2026-03-03T13:48:25.929Z', '20250906000000_role_profile_cleanup', NULL, NULL, 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20250906000000_role_profile_cleanup');

INSERT INTO _prisma_migrations (id, checksum, started_at, finished_at, migration_name, logs, rolled_back_at, applied_steps_count)
  SELECT '20260104000000_add_ban_ledger', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '2026-03-03T13:48:25.929Z', '2026-03-03T13:48:25.929Z', '20260104000000_add_ban_ledger', NULL, NULL, 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260104000000_add_ban_ledger');

INSERT INTO _prisma_migrations (id, checksum, started_at, finished_at, migration_name, logs, rolled_back_at, applied_steps_count)
  SELECT '20260225000000_admin_messaging_tables', '01a9786077efb96400f8be50ff91478ae3152bb3eedb9e9eb3c9dd5945e68699', '2026-03-03T13:48:25.929Z', '2026-03-03T13:48:25.929Z', '20260225000000_admin_messaging_tables', NULL, NULL, 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260225000000_admin_messaging_tables');
