# Admin Audit Log — Migration

## Prisma schema

- **Enum** `AuditEntityType`: `USER` | `BOOKING` | `TUTOR` | `TOKEN` | `KYC`
- **Model** `AuditLog`:
  - `id` (cuid)
  - `adminId` (User relation)
  - `action` (string)
  - `entityType` (AuditEntityType)
  - `entityId` (string)
  - `beforeData` (Json?)
  - `afterData` (Json?)
  - `createdAt` (DateTime)
- **Indexes**: `adminId`, `entityType`, `entityId`, `createdAt`, `(entityType, createdAt)`

## Migration

### Option A: `prisma db push` (already applied)

```bash
cd backend
npx prisma db push
npx prisma generate
```

### Option B: `prisma migrate dev`

```bash
cd backend
npx prisma migrate dev --name add_audit_log
```

### Option C: Manual SQL (production)

```sql
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'BOOKING', 'TUTOR', 'TOKEN', 'KYC');

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" "AuditEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "beforeData" JSONB,
  "afterData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_entityType_createdAt_idx" ON "AuditLog"("entityType", "createdAt");
```

Then run `npx prisma generate`.

## Verification

- `AuditLog` table and `AuditEntityType` enum exist.
- `GET /admin/audit` returns paginated items with optional `entityType`, `from`, `to` filters.
- Admin actions (tutor status, token adjust, unban, KYC review) create audit entries without blocking the main flow.
