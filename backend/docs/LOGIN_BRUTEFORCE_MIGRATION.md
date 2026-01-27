# Login brute-force protection — migration

## Prisma schema changes

Added to `User`:

- `failedLoginAttempts` — `Int`, default `0`
- `lockUntil` — `DateTime?`

## Migration options

### Option A: `prisma db push` (dev / already applied)

If you use `db push` for dev:

```bash
cd backend
npx prisma db push
npx prisma generate
```

Schema is already updated; ensure `prisma generate` has been run.

**Note:** Stop the NestJS backend before running `prisma generate` (or `npm run build`). Otherwise you may see `EPERM: operation not permitted` when Prisma overwrites the client files.

### Option B: `prisma migrate dev` (when shadow DB is healthy)

If your shadow DB works:

```bash
cd backend
npx prisma migrate dev --name add_login_bruteforce_protection
```

### Option C: Manual SQL (production)

Run against your PostgreSQL database:

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockUntil" TIMESTAMP(3);
```

Then regenerate the client:

```bash
npx prisma generate
```

## Verification

After migration:

1. `User` has `failedLoginAttempts` and `lockUntil`.
2. Backend starts without Prisma errors.
3. Login, refresh, and logout behave as before; lock and throttle apply only to `POST /auth/login`.

## Behaviour summary

| Scenario | HTTP | Action |
|----------|------|--------|
| &gt;5 login requests/min per IP | 429 | ThrottlerGuard (retry after 60s) |
| Account locked (≥10 failed attempts) | 403 | `ForbiddenException` |
| Invalid credentials | 401 | `UnauthorizedException` |
| Success | 200 | Reset `failedLoginAttempts`, `lockUntil`; return JWT + refresh |

JWT and refresh-token flow are unchanged; only login is affected.
