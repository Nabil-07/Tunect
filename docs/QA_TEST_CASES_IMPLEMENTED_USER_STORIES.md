# QA Test Cases — Implemented User Stories & API Contracts (Tunect)

**As-of**: 2026-02-16  
**Scope**: Test cases derived from the implemented backend API surface described in `docs/IMPLEMENTED_USER_STORIES_AND_API_CONTRACTS.md`.

This document is written for the testing team and focuses on:

- **Positive** test cases (expected happy paths)
- **Negative** test cases (validation/auth/role/security failures)
- **Edge** test cases (boundaries, concurrency, pagination, timezones)

---

## Global Assumptions / Setup

- Base URL: `http://localhost:<PORT>`
- Auth: `Authorization: Bearer <access_token>`
- Default Nest error shape is expected on most failures:

```json
{ "statusCode": 400, "message": "...", "error": "Bad Request" }
```

### Test Accounts
Prepare at least:

- `studentA` (role `STUDENT`, has `studentId`, has tokens)
- `studentB` (role `STUDENT`, no tokens)
- `tutorApproved` (role `TUTOR`, tutor `status=APPROVED`)
- `tutorPending` (role `TUTOR`, tutor `status=PENDING`)
- `admin` (role `ADMIN`)
- `directorAdmin` (role `ADMIN`, `isDirector=true`) if finance director endpoints are tested

### Common Assertions
For all protected endpoints:

- Missing `Authorization` header → `401`
- Invalid/expired token → `401`
- Wrong role (when roles are enforced) → `403`

---

## COM-001 — Email/password auth + forgot/reset

### Positive
- Register new user with valid email/password → `201`, returns `{ id, email, role }`.
- Login with correct credentials → `200`, returns `access_token`, `refresh_token`, `user`.
- Refresh with valid refresh token → `200`, returns new tokens.
- Logout with valid access token → `200`, `{ ok: true }`.
- Forgot flow (EMAIL):
  - `POST /auth/forgot/start` with `{ channel:"EMAIL", email }` → `200`, `{ ok:true }`.
  - `POST /auth/forgot/verify` with `{ channel:"EMAIL", target: email, code }` → `200`, `{ resetToken }`.
  - `POST /auth/forgot/complete` with `{ resetToken, newPassword }` → `200`, `{ ok:true }`.
  - Login with the new password → `200`.

### Negative
- Register with existing email → `409`.
- Login wrong password → `401`.
- Refresh with malformed token → `401`.
- Forgot start with missing required field:
  - `{ channel:"EMAIL" }` without `email` → `400`.
  - `{ channel:"SMS" }` without `phone` → `400`.
- Forgot start with unknown email/phone → `404`.
- Forgot verify with wrong code → `401`.
- Forgot verify with expired OTP → `401`.
- Forgot complete with invalid/expired resetToken → `401`.

### Edge
- OTP verify multiple times:
  - Verify OTP to get `resetToken`, then attempt verify again with same OTP (should still behave per latest OTP semantics).
- Forgot complete twice with same `resetToken` → second attempt should fail (`400` “already used”).
- Password length boundary: 6 chars accepted; shorter rejected (expect `400`).

---

## COM-002 — Google OAuth + choose role

### Positive
- Complete Google OAuth callback redirect and receive `access`/`refresh` in redirect URL.
- When `hasChosenRole=false`, UI redirects to `/choose-role`.
- `POST /auth/choose-role` with `{ role:"STUDENT" }` → `200` and JWT role updated.

### Negative
- Call `POST /auth/choose-role` without Bearer token → `401`.
- Choose invalid role string → `400`.

### Edge
- Choose role twice (idempotency/overwrite behavior): ensure role remains the last selected.

---

## COM-003 — User profile + password + avatar + terms

### Positive
- `GET /users/me` returns the authenticated user.
- `PATCH /users/me` updates allowed fields.
- `PATCH /users/me/password` updates password and allows login with the new password.
- `POST /users/me/avatar` with valid `image/png` file (<5MB) → `200`.
- `POST /users/me/avatar/finalize` with `{ key }` updates avatarUrl/key.
- `POST /users/me/terms/accept` → `200`.

### Negative
- `POST /users/me/avatar` missing `file` → `400`.
- `POST /users/me/avatar` unsupported mime (e.g. `image/gif`) → `400`.
- `POST /users/me/avatar` too large (>5MB) → `413` or `400` (depends on multer behavior).
- `PATCH /users/me/password` missing `newPassword` → `400`.

### Edge
- Avatar boundary file size exactly 5MB.
- Finalize avatar with `{ avatarUrl }` instead of `{ key }` (should still work if service accepts it).

---

## COM-004 — Notifications

### Positive
- `GET /notifications/my` returns list.
- `GET /notifications/my/unread-count` returns numeric count.
- `PATCH /notifications/:id/read` marks read.
- `POST /notifications/mark-all-read` marks all read.
- `DELETE /notifications/:id` removes notification.

### Negative
- Access another user’s notification id → `403` or `404` (verify actual behavior).

### Edge
- Mark read twice should be idempotent.

---

## COM-010 — Uploads (presign + secure reads)

### Positive
- `POST /uploads/presign` with valid `{ useCase, mimeType, size }` returns `{ key, uploadUrl }`.
- Upload to the returned `uploadUrl` with required headers → `200/204` (S3 behavior).
- `POST /uploads/presign-get` with `{ key }` returns a read mechanism (`url` and/or `token`).
- `GET /uploads/open/:token` streams file.

### Negative
- `POST /uploads/presign` invalid `useCase` → `400`.
- `POST /uploads/presign` size > 100MB → `400`.
- `POST /uploads/presign-get` with key outside allowed prefixes/ownership → `403`.
- `GET /uploads/open/:token` invalid/expired token → `401/400` (verify actual behavior).

### Edge
- Presign-get with `expiresIn` boundary (60 and 3600 seconds).

---

## COM-011 — Policy config (public)

### Positive
- `GET /policy-config` returns object.

### Negative
- None (public), but validate response schema is stable (no 500).

---

## STU-004/005/006/007/008 — Bookings lifecycle

### Positive
- Paid booking: `POST /bookings` with approved tutor + availability in range → `201` booking created, tokens deducted.
- Demo booking:
  - First demo for (student,tutor) allowed → `201`.
  - If slot is not available, booking becomes `PENDING` and waitlist entry created (when waitlist enabled).
- Assign slot: `PATCH /bookings/:id/assign-slot` converts pending into scheduled.
- Reschedule once (policy) → `200`.
- Cancel:
  - >=48h refund 100%
  - 24–48h refund 50% (floored)
  - <24h no refund

### Negative
- Booking with tutor not approved → `400`.
- Overlapping booking times → `400`.
- Paid booking with insufficient tokens → `400`.
- Demo booking when already used (student+tutor) → `409`.
- Reschedule beyond allowed policy (second reschedule) → `400/403`.

### Edge
- Timezone header `x-timezone`:
  - Valid IANA tz
  - Missing tz (server defaults)
  - Invalid tz value (should fail or default—verify)
- Boundary times exactly at availability edges.
- Concurrent booking requests for same slot (race): only one should succeed.

---

## STU-010 — Group sessions

### Positive
- `GET /bookings/group/available` returns only joinable future sessions.
- Join group → charges tokens and increases participants.
- Leave group → refunds and removes participant.
- Participants list returns expected shape.

### Negative
- Join full group session → `400`.
- Leave when not a participant → `400/404`.

### Edge
- Join/leave repeatedly: verify ledger correctness (no duplicate charges/refunds).

---

## STU-022/023 — Reserve tokens (pending slots)

### Positive
- `POST /bookings/reserve-with-tokens/:tutorId` creates `PENDING_SLOT` booking and deducts tokens.
- `POST /bookings/bulk-reserve-tokens/:tutorId` with `{ count: 3 }` creates 3 pending bookings and deducts tokens for all.
- Later schedule one pending booking via `PATCH /bookings/:id/assign-slot`.

### Negative
- Reserve with insufficient tokens → `400`.
- Bulk reserve with invalid count (0, negative, non-number) → `400`.

### Edge
- Bulk reserve count very large (expect rejection or performance constraints).
- Verify tokens deducted exactly match number of created bookings.

---

## STU-024 — Refund requests and token transfers

### Positive
- Student creates refund request → `200/201` with request record.
- Student creates transfer request → `200/201`.
- Student lists own requests via `/refunds/*/my`.

### Negative
- Request with malformed `purchaseDate` → `400`.
- Request with tokenAmount <= 0 → `400`.
- Student tries to access pending admin lists → `403`.

### Edge
- Multiple requests for same tutor/purchase date: verify dedupe or expected behavior.

---

## TUT-002 — Availability management

### Positive
- Create slot, list slots by date range, update slot, delete slot.
- Bulk upsert via `PATCH/PUT /availability/me/slots`.

### Negative
- Create slot with end before start → `400`.
- Overlapping availability upserts should merge/reject per service rules.

### Edge
- DST transitions in tutor timezone.

---

## TUT-009 + ADM-012 — KYC

### Positive
- Tutor submits KYC (`POST /kyc/submit` multipart) → `200`.
- Tutor checks status via `GET /kyc/status`.
- Admin lists KYC docs via `GET /kyc?status=&page=&pageSize=`.
- Admin reviews doc via `PATCH /kyc/doc/:docId`.

### Negative
- Student calls `/kyc/*` tutor endpoints → `403`.
- Upload unsupported file types → `400`.

### Edge
- Multiple KYC submissions: verify latest application is used in status.

---

## ADM-001..ADM-005 — Admin overviews

### Positive
- Admin dashboard loads without 500 (controller returns defaults on error).
- Admin list endpoints paginate correctly.

### Negative
- Non-admin calls `/admin/*` endpoints → `403`.

### Edge
- Very large pageSize should be capped.

---

## ADM-020 — Audit log

### Positive
- `GET /admin/audit` returns paginated entries.

### Negative
- Non-admin access → `403`.

### Edge
- Filter by date range and entityType boundaries.

---

## ADM-023 — Refund processing

### Positive
- Admin lists pending requests.
- Admin approves: balances/ledgers reflect action.
- Admin rejects: request status updated with adminNotes.

### Negative
- Process with invalid id → `404`.
- Process already processed request → `400`.

### Edge
- Concurrent processing attempts: only one should succeed.

---

## Notes for QA Execution

- Prefer validating behavior via both:
  - API responses
  - DB state changes (ledger entries, booking status transitions)
- For rate limiting checks, run a burst test and confirm `429` appears when limits are exceeded.
