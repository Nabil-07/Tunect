# Tunect — Implemented Requirements (BA User Stories with Embedded API Contracts)

**As-of**: 2026-02-16  
**Audience**: Business analyst, QA, frontend, backend  
**Source of truth**: Implemented backend controllers/services under `backend/src/` (cross-checked against frontend calls in `Frontend/src/services/*`).

This document is intentionally written in a **business user-story style** while still embedding the **API contracts** (endpoints + auth + sample request/response) under each story so the whole requirement is self-contained.

**Important — Frontend/backend mismatches**: When the frontend calls endpoints that are **not implemented** in the backend, they are listed in **Appendix → Frontend/Backend mismatches** so QA does not log them as regressions.

> Note on numbering: the repository does not contain pre-existing “US-###” identifiers. The IDs below are **doc-level IDs** derived from implemented features.

---

## 1) Product Scope & Personas

### Personas
- **Visitor**: unauthenticated user
- **Student**: authenticated user with role `STUDENT`
- **Tutor**: authenticated user with role `TUTOR`
- **Admin**: authenticated user with role `ADMIN`
- **Director Admin**: admin with `isDirector=true` (director-only finance)

### Feature Index (dashboard-style grouping)
- **Authentication & Access**: register/login/refresh/logout, OAuth, forgot-password OTP
- **Account & Profile**: user profile, password, avatar, terms acceptance
- **Discovery & Profiles (Student)**: tutor list/search/recommended/trending/profile
- **Bookings**: paid/demo bookings, pending slot assignment, reschedule, cancel/refund policy
- **Group Sessions**: browse/join/leave/participants
- **Waitlist**: join/view/book/remove, tutor notify
- **Tokens & Payments**: balances, ledger, payments, receipts, manual admin adjustments
- **Chat & Safety**: conversations/threads/messages, unread counts, PII ban enforcement
- **Study Materials & Assignments**: tutor managed materials, student access, assignment submit/grade
- **KYC**: tutor submit + status, admin review
- **Admin Operations**: users, tutors, students, bookings/payments, bans, blogs, reviews, support
- **Admin Insights**: audit log, metrics, policy config
- **Finance (Director/Admin)**: dashboards, reconciliation, token ledger correction, payouts
- **Real-time Session Tools**: LiveKit token, whiteboard

---

## 2) Shared API & Non-Functional Conventions

### Base URL
- Typical local/dev: `http://localhost:<PORT>`
- Swagger: `GET /docs` when `NODE_ENV !== 'production'`.

### Auth & Roles
- **Bearer JWT** for most non-public endpoints: `Authorization: Bearer <access_token>`
- Roles enforced via `JwtAuthGuard` + `RolesGuard` + `@Roles(...)`.
- Some finance endpoints use `DirectorGuard` (requires `role=ADMIN` **and** `isDirector=true`).

### Rate limiting
- Global throttling configured (`limit=120` per `ttl=60s`). Expect `429 Too Many Requests` when exceeded.

### Timezone
- Bookings may accept timezone through either:
  - Header `x-timezone: <IANA tz>` (e.g. `Asia/Kolkata`)
  - Query `?tz=<IANA tz>`

### Pagination
- Page-based: `page`, `pageSize` (some endpoints cap `pageSize`)
- Cursor-based: `cursor`, `limit`

### Standard error shape (NestJS default)
```json
{
  "statusCode": 400,
  "message": "Human readable message",
  "error": "Bad Request"
}
```

---

## 3) Common User Stories (COM)

### COM-001 — Authenticate with email/password (Register/Login/Refresh/Logout/Forgot Password)

**Business goal**: Allow users to securely access the platform and recover accounts without support.

**User story**: As a user, I want to register/login and receive JWTs, so that I can access protected features.

**Acceptance criteria**
- Registering an existing email returns `409`.
- Login with wrong credentials returns `401`.
- Refresh with invalid/expired token returns `401`.
- Forgot-start for unknown email/phone returns `404`.
- OTP verify with wrong/expired code returns `401`.
- Reset completion with invalid/expired/used reset token returns `401/400`.

**APIs (with embedded contract + samples)**

- `POST /auth/register` (Public)
  - Request (example)
    ```json
    { "email": "studentA@example.com", "password": "Secret123", "role": "STUDENT" }
    ```
  - Response `201` (example)
    ```json
    { "id": "usr_123", "email": "studentA@example.com", "role": "STUDENT" }
    ```

- `POST /auth/login` (Public)
  - Request (example)
    ```json
    { "email": "studentA@example.com", "password": "Secret123" }
    ```
  - Response `200` (example)
    ```json
    {
      "access_token": "<jwt>",
      "refresh_token": "<refresh>",
      "user": { "id": "usr_123", "email": "studentA@example.com", "role": "STUDENT", "isDirector": false }
    }
    ```

- `POST /auth/refresh` (Public)
  - Request (example)
    ```json
    { "refreshToken": "<refresh>" }
    ```
  - Response `200` (example)
    ```json
    {
      "access_token": "<jwt>",
      "refresh_token": "<refresh>",
      "user": {
        "id": "usr_123",
        "email": "studentA@example.com",
        "role": "STUDENT",
        "isDirector": false,
        "student": { "id": "stu_123" },
        "tutor": null
      }
    }
    ```

- `POST /auth/logout` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `POST /auth/forgot/start` (Public)
  - Request (EMAIL example)
    ```json
    { "channel": "EMAIL", "email": "studentA@example.com" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "message": "OTP sent if account exists" }
    ```
  - Errors
    - `400` missing `email/phone` for the selected channel
    - `404` account does not exist

- `POST /auth/forgot/verify` (Public)
  - Request (example)
    ```json
    { "channel": "EMAIL", "target": "studentA@example.com", "code": "123456" }
    ```
  - Response `200` (example)
    ```json
    { "resetToken": "<reset_token>" }
    ```
  - Errors: `401` invalid/expired OTP

- `POST /auth/forgot/complete` (Public)
  - Request (example)
    ```json
    { "resetToken": "<reset_token>", "newPassword": "NewSecret123" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "message": "Password reset successfully" }
    ```

### COM-002 — Google OAuth login + post-OAuth persona selection

**Business goal**: Reduce sign-up friction and ensure accounts map to the correct platform persona.

**User story**: As a user, I want to login via Google and then choose Student/Tutor persona, so that my account has the right role.

**Acceptance criteria**
- User without persona gets redirected to `/choose-role`.
- Choosing role updates the user persona and returns next route.

**APIs (with samples)**

- `GET /auth/google/start` (Public) → redirects to Google
- `GET /auth/google` (Public) → OAuth handler
- `GET /auth/google/callback` (Public) → redirects back to frontend with tokens

- `POST /auth/choose-role` (Bearer)
  - Request (example)
    ```json
    { "role": "TUTOR" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "access_token": "<jwt>", "next": "/tutor/onboarding" }
    ```

- `POST /profiles/choose-role` (Bearer)
  - Request (example)
    ```json
    { "role": "STUDENT" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "access_token": "<jwt>", "profile": { "role": "STUDENT" } }
    ```

### COM-003 — Account profile management (User-level)

**Business goal**: Allow authenticated users to self-serve account changes.

**User story**: As a logged-in user, I want to view/update my account profile and password, so that I can manage my account.

**Acceptance criteria**
- Must be authenticated.
- Avatar upload rejects unsupported mime types and oversized files.

**APIs (with samples)**

- `GET /users/me` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "usr_123", "email": "studentA@example.com", "name": "Student A", "role": "STUDENT", "avatarUrl": null }
    ```

- `PATCH /users/me` (Bearer)
  - Request (example)
    ```json
    { "name": "Student A", "preferredCurrency": "INR" }
    ```
  - Response `200` (example)
    ```json
    { "id": "usr_123", "email": "studentA@example.com", "name": "Student A", "preferredCurrency": "INR" }
    ```

- `PATCH /users/me/password` (Bearer)
  - Request (example)
    ```json
    { "currentPassword": "Secret123", "newPassword": "NewSecret123" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `POST /users/me/avatar` (Bearer, multipart/form-data)
  - Form fields: `file` (jpeg/png/webp, max 5MB)
  - Response `200` (example)
    ```json
    { "ok": true, "key": "avatars/usr_123/1700000000.png" }
    ```

- `POST /users/me/avatar/finalize` (Bearer)
  - Request (example)
    ```json
    { "key": "avatars/usr_123/1700000000.png" }
    ```
  - Response `200` (example)
    ```json
    { "id": "usr_123", "avatarUrl": "https://.../avatars/usr_123/1700000000.png" }
    ```

- `POST /users/me/terms/accept` (Bearer)
  - Request (example)
    ```json
    { "version": 2 }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "acceptedVersion": 2 }
    ```

### COM-004 — Notifications inbox

**Business goal**: Ensure users are informed about important events and can clear/read notifications.

**User story**: As a logged-in user, I want to see and manage my notifications, so that I don’t miss important events.

**APIs (with samples)**

- `GET /notifications/my?unreadOnly=true|false` (Bearer)
  - Response `200` (example)
    ```json
    {
      "items": [
        { "id": "ntf_1", "title": "Booking confirmed", "body": "Your session is confirmed", "isRead": false, "createdAt": "2026-02-16T10:00:00.000Z" }
      ]
    }
    ```

- `GET /notifications/my/unread-count` (Bearer)
  - Response `200` (example)
    ```json
    { "unread": 3 }
    ```

- `PATCH /notifications/:id/read` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `POST /notifications/mark-all-read` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true, "updated": 3 }
    ```

- `DELETE /notifications/:id` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### COM-005 — System health endpoints

**Business goal**: Allow operations to validate service liveness/readiness.

**User story**: As an operator, I want health endpoints to verify service readiness.

**APIs (with samples)**

- `GET /health` (Public)
  - Response `200` (example)
    ```json
    { "ok": true, "ts": "2026-02-16T10:00:00.000Z" }
    ```

- `GET /ready` (Public)
  - Response `200` (example)
    ```json
    { "status": "ok" }
    ```

### COM-006 — Public marketing content (blogs + stats)

**Business goal**: Serve public content for marketing and discovery.

**User story**: As a visitor, I want to view public stats and blogs.

**APIs (with samples)**

- `GET /stats/public` (Public)
  - Response `200` (example)
    ```json
    { "tutors": 120, "students": 5400, "sessionsCompleted": 8700 }
    ```

- `GET /blogs?page=&pageSize=` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "blog_1", "title": "How it works", "slug": "how-it-works" }], "total": 1, "page": 1, "pageSize": 10 }
    ```

- `GET /blogs/:slug` (Public)
  - Response `200` (example)
    ```json
    { "id": "blog_1", "title": "How it works", "slug": "how-it-works", "content": "<html>...</html>" }
    ```

### COM-007 — Referrals

**Business goal**: Enable organic growth via referral invites.

**User story**: As a user, I want to generate referral invites and view referral stats.

**APIs (with samples)**

- `POST /referrals` (Bearer)
  - Request (example)
    ```json
    { "referredEmail": "friend@example.com" }
    ```
  - Response `201/200` (example)
    ```json
    { "ok": true, "referralId": "ref_1" }
    ```

- `GET /referrals/my-code` (Bearer)
  - Response `200` (example)
    ```json
    { "code": "TUNECT-ABCD" }
    ```

- `GET /referrals/my-referrals` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "ref_1", "referredEmail": "friend@example.com", "status": "PENDING" }] }
    ```

- `GET /referrals/validate?code=...` (Public)
  - Response `200` (example)
    ```json
    { "valid": true, "code": "TUNECT-ABCD" }
    ```

### COM-008 — Real-time classroom tooling (LiveKit token + Whiteboard)

**Business goal**: Provide session tooling for real-time teaching.

**User story**: As a session participant, I want session tools for video/whiteboard.

**APIs (with samples)**

- `POST /livekit/token` (Bearer)
  - Request (example)
    ```json
    { "bookingId": "bk_123" }
    ```
  - Response `200` (example)
    ```json
    { "token": "<livekit_token>", "room": "booking-bk_123" }
    ```

- `GET /whiteboard/:bookingId` (Bearer)
  - Response `200` (example)
    ```json
    { "bookingId": "bk_123", "data": {} }
    ```

- `POST /whiteboard/:bookingId` (Bearer)
  - Request: any JSON (example)
    ```json
    { "ops": [{ "type": "draw", "x": 10, "y": 20 }] }
    ```
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `POST /whiteboard/:bookingId/export` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true, "exportUrl": "https://.../whiteboard/bk_123.png" }
    ```

### COM-009 — Upload and manage chat message attachments

**Business goal**: Allow users to exchange files when messaging (where enabled).

**User story**: As a chat user, I want to attach files to messages, so that I can share documents/media.

**Acceptance criteria**
- Upload accepts up to 5 files per request and enforces per-file size limits.
- Only authenticated users can upload/list/delete attachments.

**APIs (with samples)**

- `POST /attachments/upload/:messageId` (Bearer, multipart/form-data)
  - Form fields: `files[]` (max 5; 10MB each)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "att_1", "messageId": "msg_1", "url": "https://.../att_1" }] }
    ```

- `GET /attachments/message/:messageId` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "att_1", "messageId": "msg_1", "url": "https://.../att_1" }] }
    ```

- `DELETE /attachments/:id` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### COM-010 — Uploads: presign upload + secure reads

**Business goal**: Enable safe uploads and controlled file reads.

**User story**: As a logged-in user, I want pre-signed upload URLs and secure file reads, so that I can upload documents/media safely.

**APIs (with samples)**

- `POST /uploads/presign` (Bearer)
  - Request (example)
    ```json
    { "useCase": "avatars", "mimeType": "image/png", "size": 34567 }
    ```
  - Response `200` (example)
    ```json
    { "key": "avatars/usr_123/1700000000.png", "uploadUrl": "https://...", "headers": { "Content-Type": "image/png" } }
    ```

- `POST /uploads/presign-get` (Bearer)
  - Request (example)
    ```json
    { "key": "avatars/usr_123/1700000000.png", "expiresIn": 3600 }
    ```
  - Response `200` (example)
    ```json
    { "url": "https://...", "token": "tok_abc", "expiresAt": "2026-02-16T11:00:00.000Z" }
    ```

- `GET /uploads/open/:token` (Public; streams)
  - Response `200`: streamed content
  - Response headers include `Content-Type`, `Content-Disposition`, `X-Url-Expires-At`

### COM-011 — Public policy configuration

**Business goal**: Drive UI/behavior from centrally managed policy values.

**User story**: As a visitor/app client, I want public policy configuration values, so that the UI can render policy-driven behavior.

**APIs (with samples)**

- `GET /policy-config` (Public)
  - Response `200` (example)
    ```json
    { "cancellation": { "refund48h": 1.0, "refund24to48h": 0.5, "refundUnder24h": 0.0 } }
    ```

---

---

## 4) Student User Stories (STU)

### STU-001 — Discover tutors (list/search/trending/filter options)

**Business goal**: Let students find relevant tutors quickly.

**User story**: As a student, I want to browse and search tutors with filters, so that I can find the best tutor.

**Acceptance criteria**
- Public tutor list loads without authentication.
- Recommended tutors require authentication.
- Filters/options endpoint returns available filter values.

**APIs (with samples)**

- `GET /tutors` (Public)
  - Query: `page`, `pageSize`, `subject`, `class`, `language`, `sortBy`, `sortOrder`
  - Response `200` (example)
    ```json
    {
      "items": [{ "id": "tut_1", "name": "Tutor One", "subjects": ["Math"], "hourlyRate": 25 }],
      "total": 1,
      "page": 1,
      "pageSize": 10
    }
    ```

- `GET /tutors/recommended` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tut_1", "name": "Tutor One", "score": 0.92 }] }
    ```

- `GET /tutors/search` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tut_1", "name": "Tutor One" }], "total": 1 }
    ```

- `GET /tutors/trending` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tut_2", "name": "Tutor Trending" }] }
    ```

- `GET /tutors/filters/options` (Public)
  - Response `200` (example)
    ```json
    { "subjects": ["Math", "English"], "languages": ["English", "Hindi"] }
    ```

- `GET /search/tutors` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tut_1", "name": "Tutor One" }], "meta": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 } }
    ```

- `GET /search/subjects` (Public)
  - Response `200` (example)
    ```json
    { "items": ["Math", "English", "Science"] }
    ```

### STU-002 — View tutor profile + activity + availability

**Business goal**: Enable booking decisions by presenting tutor details and bookable times.

**User story**: As a student, I want to view tutor details and availability, so that I can pick a slot.

**Acceptance criteria**
- Tutor profile endpoints are public.
- Availability is returned in UTC timestamps.
- Bookable endpoint respects `from/to/durationMin/stepMin` and returns only valid slots.

**APIs (with samples)**

- `GET /tutors/:idOrTid` (Public)
  - Response `200` (example)
    ```json
    { "id": "tut_1", "name": "Tutor One", "bio": "...", "subjects": ["Math"], "hourlyRate": 25 }
    ```

- `GET /tutors/:id/activity` (Public)
  - Response `200` (example)
    ```json
    { "recentBookings": 10, "rating": 4.7 }
    ```

- `GET /availability/tutors/:tutorId` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "slot_1", "startTime": "2026-02-20T10:00:00.000Z", "endTime": "2026-02-20T10:30:00.000Z" }] }
    ```

- `GET /availability/tutors/:tutorId/bookable?from=&to=&durationMin=&stepMin=` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "startTime": "2026-02-20T10:00:00.000Z", "endTime": "2026-02-20T10:30:00.000Z" }] }
    ```

- `GET /tutors/:id/availability?from=&to=` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "startTime": "2026-02-20T10:00:00.000Z", "endTime": "2026-02-20T10:30:00.000Z" }] }
    ```

### STU-003 — Favorite tutors

**Business goal**: Let students shortlist tutors for faster re-discovery.

**User story**: As a student, I want to favorite tutors, so that I can revisit them quickly.

**Acceptance criteria**
- Only the authenticated student can manage their own favorites.
- Favoriting the same tutor twice is idempotent (no duplicates).

**APIs (with samples)**

- `GET /favorites/my` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "tutorId": "tut_1", "createdAt": "2026-02-16T10:00:00.000Z" }] }
    ```

- `POST /favorites/:tutorId` (Bearer; role STUDENT)
  - Response `200/201` (example)
    ```json
    { "ok": true, "tutorId": "tut_1" }
    ```

- `DELETE /favorites/:tutorId` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `GET /favorites/check/:tutorId` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "isFavorite": true }
    ```

### STU-004 — Create paid bookings (token-charged)

**Business goal**: Allow students to schedule paid sessions using tokens.

**User story**: As a student, I want to create a paid booking, so that I can schedule a session.

**Acceptance criteria**
- Tutor must be `APPROVED`.
- Booking times must be within availability and must not overlap existing bookings.
- Token ledger is updated (deduct) on successful booking creation.

**APIs (with samples)**

- `POST /bookings` (Bearer; roles STUDENT/ADMIN)
  - Header (optional): `x-timezone: Asia/Kolkata`
  - Query (optional): `?tz=Asia/Kolkata`
  - Request (example)
    ```json
    {
      "tutorId": "tut_1",
      "startTime": "2026-02-20T10:00:00.000Z",
      "endTime": "2026-02-20T10:30:00.000Z",
      "notes": "Need help with algebra",
      "isDemo": false
    }
    ```
  - Response `201` (example)
    ```json
    {
      "id": "bk_123",
      "tutorId": "tut_1",
      "studentId": "stu_123",
      "status": "CONFIRMED",
      "startTime": "2026-02-20T10:00:00.000Z",
      "endTime": "2026-02-20T10:30:00.000Z",
      "isDemo": false,
      "isGroupSession": false,
      "meetingProvider": "LIVEKIT",
      "meetingUrl": "livekit:bk_123"
    }
    ```
  - Errors
    - `400` overlap / tutor not approved / insufficient tokens

### STU-005 — Create demo bookings (free)

**Business goal**: Reduce purchase friction by offering a limited demo.

**User story**: As a student, I want to book a free demo session, so that I can evaluate a tutor.

**Acceptance criteria**
- Only one demo per (student, tutor) pair.
- When the chosen time is not feasible, the system creates a `PENDING` demo booking and (when enabled) a waitlist entry.

**APIs (with samples)**

- `POST /bookings/demo` (Bearer; roles STUDENT/ADMIN)
  - Request (example)
    ```json
    {
      "tutorId": "tut_1",
      "startTime": "2026-02-20T10:00:00.000Z",
      "endTime": "2026-02-20T10:30:00.000Z",
      "notes": "Demo request"
    }
    ```
  - Response `201` (example — scheduled)
    ```json
    { "id": "bk_demo_1", "tutorId": "tut_1", "studentId": "stu_123", "isDemo": true, "status": "CONFIRMED" }
    ```
  - Response `201` (example — pending)
    ```json
    { "id": "bk_demo_2", "tutorId": "tut_1", "studentId": "stu_123", "isDemo": true, "status": "PENDING", "startTime": null, "endTime": null }
    ```
  - Errors
    - `409` demo already used

- `GET /bookings/demo-status/:tutorId` (Bearer)
  - Response `200` (example)
    ```json
    { "used": true }
    ```

- `POST /bookings/demo-status/bulk` (Bearer)
  - Request (example)
    ```json
    { "tutorIds": ["tut_1", "tut_2"] }
    ```
  - Response `200` (example)
    ```json
    { "tut_1": true, "tut_2": false }
    ```

### STU-006 — Assign a slot to a pending booking (demo or paid)

**Business goal**: Convert pending bookings into scheduled sessions.

**User story**: As a student, I want to assign start/end time to a pending booking, so that it becomes a scheduled session.

**APIs (with samples)**

- `PATCH /bookings/:id/assign-slot` (Bearer; roles STUDENT/TUTOR/ADMIN)
  - Request (example)
    ```json
    { "startTime": "2026-02-22T10:00:00.000Z", "endTime": "2026-02-22T10:30:00.000Z", "notes": "Prefer morning" }
    ```
  - Response `200` (example)
    ```json
    { "id": "bk_demo_2", "status": "CONFIRMED", "startTime": "2026-02-22T10:00:00.000Z", "endTime": "2026-02-22T10:30:00.000Z" }
    ```

### STU-007 — Reschedule a booking (one-time policy)

**Business goal**: Allow one controlled reschedule without support.

**User story**: As a student, I want to reschedule a booking, so that I can handle conflicts.

**Acceptance criteria**
- Reschedule is allowed at most once (policy enforced).
- New time must be within availability and not overlapping.

**APIs (with samples)**

- `PATCH /bookings/:id/reschedule` (Bearer; role STUDENT)
  - Request (example)
    ```json
    { "startTime": "2026-02-21T10:00:00.000Z", "endTime": "2026-02-21T10:30:00.000Z", "notes": "Need to move" }
    ```
  - Response `200` (example)
    ```json
    { "id": "bk_123", "status": "CONFIRMED", "startTime": "2026-02-21T10:00:00.000Z", "endTime": "2026-02-21T10:30:00.000Z" }
    ```

### STU-008 — Cancel a booking (refund policy)
 
**Business goal**: Provide predictable cancellations/refunds.

**User story**: As a student, I want to cancel a booking and receive refunds based on policy.

- **Implemented policy** (from bookings service)
  - If **group session** and student cancels: **no refund**.
  - Else:
    - \( \ge 48h \): 100% refund
    - \( 24-48h \): 50% refund (floored)
    - \( < 24h \): 0% refund
**APIs (with samples)**

- `DELETE /bookings/:id` (Bearer; roles STUDENT/TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    { "id": "bk_123", "status": "CANCELED", "refund": { "tokenRefund": 10, "policyApplied": "48H" } }
    ```

### STU-009 — View my bookings + booking details + next session

**Business goal**: Let students track and attend sessions.

**User story**: As a student, I want to view my bookings and session details including meeting links.

**APIs (with samples)**

- `GET /students/my-bookings` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "bk_123", "status": "CONFIRMED", "startTime": "2026-02-20T10:00:00.000Z" }] }
    ```

- `GET /bookings?page=&pageSize=&status=&from=&to=` (Bearer; roles STUDENT/TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "bk_123", "status": "CONFIRMED" }], "total": 1, "page": 1, "pageSize": 10 }
    ```

- `GET /bookings/next` (Bearer; roles STUDENT/ADMIN)
  - Response `200` (example)
    ```json
    { "id": "bk_123", "startTime": "2026-02-20T10:00:00.000Z", "meetingUrl": "livekit:bk_123" }
    ```

- `GET /bookings/:id/details` (Bearer; roles STUDENT/TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    {
      "id": "bk_123",
      "status": "CONFIRMED",
      "startTime": "2026-02-20T10:00:00.000Z",
      "endTime": "2026-02-20T10:30:00.000Z",
      "meetingProvider": "LIVEKIT",
      "meetingUrl": "livekit:bk_123",
      "tutor": { "id": "tut_1", "name": "Tutor One", "email": "tutor1@example.com" },
      "student": { "id": "stu_123", "name": "Student A", "email": "studentA@example.com" },
      "isDemo": false,
      "isGroupSession": false
    }
    ```

### STU-010 — Group sessions (browse/join/leave/participants)

**Business goal**: Allow students to join group learning sessions.

**User story**: As a student, I want to join group sessions when available.

**APIs (with samples)**

- `GET /bookings/group/available?subject=&startDate=&endDate=` (Bearer; roles STUDENT/TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "bk_group_1", "subject": "Math", "startTime": "2026-02-25T10:00:00.000Z", "maxStudents": 5, "currentEnrollment": 2 }] }
    ```

- `POST /bookings/:id/join` (Bearer; roles STUDENT/ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "bookingId": "bk_group_1", "chargedTokens": 5 }
    ```

- `DELETE /bookings/:id/leave` (Bearer; roles STUDENT/ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "bookingId": "bk_group_1", "refundedTokens": 5 }
    ```

- `GET /bookings/:id/participants` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "usr_1", "name": "Student A", "email": "studentA@example.com", "avatarUrl": null }] }
    ```

### STU-011 — Waitlist (join/view/book/remove)

**Business goal**: Avoid lost conversions when desired slots are unavailable.

**User story**: As a student, I want to join a waitlist when I can’t book, and book when notified.

**Acceptance criteria**
- Waitlist can be disabled via env flag; when disabled, endpoints return `503`.
- Students can only view/manage their own waitlist entries.

**Implementation note**: waitlist endpoints are gated by env `ENABLE_WAITLIST=true` (otherwise 503).

**APIs (with samples)**

- `POST /waitlist` (Bearer; roles STUDENT/ADMIN)
  - Request (example)
    ```json
    { "tutorId": "tut_1", "requestedStartTime": "2026-02-20T10:00:00.000Z", "requestedEndTime": "2026-02-20T10:30:00.000Z", "subject": "Math" }
    ```
  - Response `201` (example)
    ```json
    { "id": "wl_1", "tutorId": "tut_1", "studentId": "stu_123", "status": "ACTIVE" }
    ```

- `GET /waitlist/my` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "wl_1", "tutorId": "tut_1", "status": "ACTIVE" }] }
    ```

- `POST /waitlist/:id/book` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "ok": true, "bookingId": "bk_999" }
    ```

- `DELETE /waitlist/:id` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### STU-012 — Tokens & payments history

**Business goal**: Provide transparency into spending and balances.

**User story**: As a student, I want to view token balances and history.

**APIs (with samples)**

- `GET /students/me` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "id": "stu_123", "userId": "usr_123", "grade": "10", "createdAt": "2026-02-01T00:00:00.000Z" }
    ```

- `PATCH /students/me` (Bearer; role STUDENT)
  - Request (example)
    ```json
    { "grade": "11" }
    ```
  - Response `200` (example)
    ```json
    { "id": "stu_123", "grade": "11" }
    ```

- `GET /students/me/tokens` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "balance": 42 }
    ```

- `GET /students/me/tokens/ledger?page=&pageSize=` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "led_1", "delta": -10, "reason": "BOOKING", "createdAt": "2026-02-16T10:00:00.000Z" }], "total": 1 }
    ```

- `GET /students/me/payments?page=&pageSize=` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "pay_1", "status": "PAID", "amountInMinor": 49900, "currency": "INR" }], "total": 1 }
    ```

- `GET /students/me/token-balances` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "tutorId": "tut_1", "balance": 20 }, { "tutorId": "tut_2", "balance": 22 }] }
    ```

- `GET /students/me/token-ledger` (Bearer; role STUDENT)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tled_1", "tutorId": "tut_1", "delta": -5, "type": "DEBIT" }] }
    ```

### STU-013 — Buy tokens via Razorpay and retrieve receipts

**Business goal**: Enable payments and token top-ups for platform usage.

**User story**: As a student, I want to purchase tokens, so that I can book sessions and chat.

**Acceptance criteria**
- Order creation returns a gateway order reference.
- Verification marks payment as paid and credits tokens.
- Receipt endpoint streams a PDF.

**API contract (high-signal)**
  - **POST `/payments/order`**
    - **Body** (from `CreateOrderDto`): `{ tutorId, tokens (min 5), notes?, displayCurrency? }`
  - **POST `/payments/verify`**
    - **Body** (from `VerifyPaymentDto`): `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
  - **GET `/payments/:id/receipt`**
    - **Response 200**: `application/pdf` stream

**API responses (examples)**

- `POST /payments/order` → `200`
  ```json
  { "orderId": "order_raz_1", "amountInMinor": 49900, "currency": "INR", "tokens": 50 }
  ```

- `POST /payments/verify` → `200`
  ```json
  { "ok": true, "paymentId": "pay_1", "status": "PAID" }
  ```

- `GET /payments/:id` → `200`
  ```json
  { "id": "pay_1", "status": "PAID", "tokens": 50, "createdAt": "2026-02-16T10:00:00.000Z" }
  ```

### STU-014 — In-app chat + message moderation + PII auto-ban (implemented)

**Business goal**: Provide safe in-app communication with guardrails.

**User story**: As a student, I want to message tutors inside the app (token gated), so that I can coordinate about sessions safely.

- **Implemented** (see `CHAT_SYSTEM_IMPLEMENTATION.md`, `PII_BAN_SYSTEM_IMPLEMENTATION.md`, and controller `backend/src/messages/messages.controller.ts`)
  - Post messages with max length 2000.
  - Threads/conversations listing, archive/unarchive.
  - Unread count endpoint(s).
  - PII detection: after 3 violations user is banned and funds forfeited; messages containing PII are blocked.
**APIs (with samples)**

- `GET /chat/conversations` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "conv_1", "lastMessage": "Hi", "unread": 1, "updatedAt": "2026-02-16T10:00:00.000Z" }] }
    ```

- `GET /chat/thread/:id` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "conv_1", "messages": [{ "id": "msg_1", "text": "Hi", "senderId": "usr_123", "createdAt": "2026-02-16T10:00:00.000Z" }] }
    ```

- `POST /chat` (Bearer)
  - Request (example)
    ```json
    { "conversationId": "conv_1", "text": "Hello" }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "msg_2", "conversationId": "conv_1", "text": "Hello", "createdAt": "2026-02-16T10:01:00.000Z" }
    ```
  - Errors
    - `403` token-gated and token balance exhausted / banned

- `POST /chat/conversations/:id/messages` (Bearer)
  - Request (example)
    ```json
    { "text": "Hello again" }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "msg_3", "conversationId": "conv_1", "text": "Hello again" }
    ```

- `GET /chat/unread_count` (Bearer)
  - Response `200` (example)
    ```json
    { "unread": 2 }
    ```

### STU-015 — Reviews

**Business goal**: Build trust and provide tutor feedback loops.

**User story**: As a student, I want to review a completed session.

**Acceptance criteria**
- Rating must be within 1–5.
- Students can only delete their own reviews.

**APIs (with samples)**

- `POST /reviews` (Bearer)
  - Request (example)
    ```json
    { "bookingId": "bk_123", "rating": 5, "comment": "Great session" }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "rev_1", "bookingId": "bk_123", "rating": 5, "comment": "Great session" }
    ```

- `GET /reviews/me` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "rev_1", "rating": 5, "createdAt": "2026-02-16T10:00:00.000Z" }] }
    ```

- `DELETE /reviews/:id` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `GET /reviews/tutor/:tutorId` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "rev_1", "rating": 5, "comment": "Great" }], "avg": 4.8 }
    ```

- `GET /reviews/featured` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "rev_1", "rating": 5, "tutorId": "tut_1" }] }
    ```

### STU-016 — Assignments (student view + submit)

**Business goal**: Support asynchronous practice and tutor feedback.

**User story**: As a student, I want to see assignments and submit solutions.

**Acceptance criteria**
- Assignment list shows only student-relevant assignments.
- Submissions accept optional attachment and optional notes.

**API contract note**: `POST /assignments/:id/submit` consumes `multipart/form-data` with fields: `notes` and optional `file`.

**APIs (with samples)**

- `GET /assignments/student` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "asg_1", "title": "Homework 1", "dueAt": "2026-02-20T00:00:00.000Z" }] }
    ```

- `GET /assignments/:id` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "asg_1", "title": "Homework 1", "description": "Solve problems", "attachments": [] }
    ```

- `POST /assignments/:id/submit` (Bearer; multipart/form-data)
  - Response `200/201` (example)
    ```json
    { "ok": true, "submissionId": "sub_1", "assignmentId": "asg_1" }
    ```

### STU-017 — Session notes (view + approve)

**Business goal**: Improve learning retention with post-session summaries.

**User story**: As a student, I want session notes after my booking, so that I can revise.

**Acceptance criteria**
- Only the booking’s student can view/approve notes for that booking.
- AI-generated notes require explicit approval.

**APIs (with samples)**

- `GET /session-notes/booking/:bookingId` (Bearer)
  - Response `200` (example)
    ```json
    { "bookingId": "bk_123", "notes": "Covered algebra basics", "status": "DRAFT" }
    ```

- `GET /session-notes/my-notes` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "noteId": "note_1", "bookingId": "bk_123", "status": "APPROVED" }] }
    ```

- `PUT /session-notes/:noteId/approve` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true, "noteId": "note_1", "status": "APPROVED" }
    ```

- `POST /session-notes/booking/:bookingId/generate-ai` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true, "noteId": "note_ai_1", "status": "AI_GENERATED" }
    ```

- `PUT /session-notes/:noteId/approve-ai` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true, "noteId": "note_ai_1", "status": "APPROVED" }
    ```

### STU-018 — Learning goals and milestones

**Business goal**: Help students plan and track structured progress.

**User story**: As a student, I want to set goals and track milestones.

**Acceptance criteria**
- Students can CRUD only their own goals/milestones.

**APIs (with samples)**

- `POST /learning-goals` (Bearer)
  - Request (example)
    ```json
    { "title": "Improve math", "targetDate": "2026-05-01" }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "goal_1", "title": "Improve math", "targetDate": "2026-05-01" }
    ```

- `GET /learning-goals/my` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "goal_1", "title": "Improve math" }] }
    ```

- `GET /learning-goals/:goalId` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "goal_1", "title": "Improve math", "milestones": [] }
    ```

- `PUT /learning-goals/:goalId` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "goal_1", "title": "Improve math (updated)" }
    ```

- `DELETE /learning-goals/:goalId` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

- `POST /learning-goals/:goalId/milestones` (Bearer)
  - Response `201/200` (example)
    ```json
    { "id": "ms_1", "goalId": "goal_1", "title": "Finish chapter 1" }
    ```

- `PUT /learning-goals/milestones/:milestoneId` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "ms_1", "title": "Finish chapter 1 (updated)" }
    ```

- `DELETE /learning-goals/milestones/:milestoneId` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### STU-019 — Certificates

**Business goal**: Provide recognition and motivation.

**User story**: As a student, I want to see certificates I earned or can earn.

**Acceptance criteria**
- “My certificates” returns only certificates owned by the student.

**APIs (with samples)**

- `GET /certificates/my` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "cert_1", "subject": "Math", "issuedAt": "2026-02-10" }] }
    ```

- `GET /certificates/eligible` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "subject": "Math", "eligible": true }] }
    ```

- `GET /certificates/subject/:subject` (Public/Bearer depending on implementation)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "cert_template_1", "subject": "Math" }] }
    ```

- `GET /certificates/:certificateId` (Bearer)
  - Response `200` (example)
    ```json
    { "id": "cert_1", "subject": "Math", "studentId": "stu_123", "pdfUrl": "https://.../cert_1.pdf" }
    ```

### STU-020 — Progress summary

**Business goal**: Provide measurable progress visibility.

**User story**: As a student, I want to see progress stats like total hours.

**Acceptance criteria**
- Progress endpoints return stable numeric totals and per-subject breakdowns.

**APIs (with samples)**

- `GET /student-progress/me` (Bearer)
  - Response `200` (example)
    ```json
    { "subjects": [{ "subject": "Math", "hours": 12.5 }], "totalHours": 12.5 }
    ```

- `GET /student-progress/me/total-hours` (Bearer)
  - Response `200` (example)
    ```json
    { "totalHours": 12.5 }
    ```

### STU-021 — Study materials (public) + download tracking

**Business goal**: Provide learning resources and track usage.

**User story**: As a student, I want to access public study materials and track downloads.

**Acceptance criteria**
- Public materials list is accessible without auth.
- Shared materials are accessible only to authenticated students.
- Download tracking increments counters without errors.

**APIs (with samples)**

- `GET /study-materials/public?subject=...` (Public)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "mat_1", "title": "Algebra notes", "subject": "Math", "downloadCount": 10 }] }
    ```

- `GET /study-materials/shared-with-me` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "mat_2", "title": "Shared worksheet", "sharedByTutorId": "tut_1" }] }
    ```

- `GET /study-materials/:id` (Public/Bearer depending on access)
  - Response `200` (example)
    ```json
    { "id": "mat_1", "title": "Algebra notes", "files": [{ "name": "algebra.pdf", "url": "https://..." }] }
    ```

- `POST /study-materials/:id/download` (Bearer)
  - Response `200` (example)
    ```json
    { "ok": true, "downloadCount": 11 }
    ```

### STU-022 — Reserve tokens for a future session (pending slot)

**Business goal**: Enable token reservations without immediate scheduling.

**User story**: As a student, I want to reserve a token-paid session without selecting a time immediately, so that I can schedule later.

- **Requirements**
  - Creates a `PENDING_SLOT` booking by deducting tokens upfront.
  - Student can later schedule by assigning a slot via `PATCH /bookings/:id/assign-slot`.
**APIs (with samples)**

- `POST /bookings/reserve-with-tokens/:tutorId` (Bearer; role STUDENT)
  - Response `201/200` (example)
    ```json
    { "id": "bk_pending_1", "tutorId": "tut_1", "studentId": "stu_123", "status": "PENDING_SLOT", "startTime": null, "endTime": null }
    ```
  - Errors: `400` insufficient tokens / invalid tutor

### STU-023 — Bulk reserve tokens (multiple pending slots)

**Business goal**: Support bulk pre-purchase/commitment flows.

**User story**: As a student, I want to reserve multiple future sessions in one action.

**APIs (with samples)**

- `POST /bookings/bulk-reserve-tokens/:tutorId` (Bearer; role STUDENT)
  - Request (example)
    ```json
    { "count": 3 }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "created": 3, "items": [{ "id": "bk_pending_1" }, { "id": "bk_pending_2" }, { "id": "bk_pending_3" }] }
    ```

### STU-024 — Refund requests and token transfers

**Business goal**: Provide a structured pathway for financial adjustments.

**User story**: As a student, I want to request refunds or transfer tokens between tutors, so that finance/admin can resolve issues.

**Acceptance criteria**
- Students can only create and view their own requests.
- Newly created requests start in `PENDING`.
- **API contract (high-signal)**
  - **POST `/refunds/request`**
    - **Body**: `{ tutorId: string, tokenAmount: number, purchaseDate: string, reason?: string }`
  - **POST `/refunds/transfer`**
    - **Body**: `{ fromTutorId: string, toTutorId: string, tokenAmount: number, reason?: string }`

**API responses (examples)**

- `POST /refunds/request` → `201/200`
  ```json
  { "id": "rreq_1", "status": "PENDING", "tokenAmount": 10, "tutorId": "tut_1" }
  ```

- `POST /refunds/transfer` → `201/200`
  ```json
  { "id": "tr_1", "status": "PENDING", "fromTutorId": "tut_1", "toTutorId": "tut_2", "tokenAmount": 5 }
  ```

- `GET /refunds/request/my` → `200`
  ```json
  { "items": [{ "id": "rreq_1", "status": "PENDING" }] }
  ```

- `GET /refunds/transfer/my` → `200`
  ```json
  { "items": [{ "id": "tr_1", "status": "PENDING" }] }
  ```

---

---

## 5) Tutor User Stories (TUT)

### TUT-001 — Tutor profile (view/update)

**Business goal**: Keep tutor profiles accurate for student trust and conversion.

**User story**: As a tutor, I want to manage my tutor profile.

**APIs (with samples)**

- `GET /tutors/me` (Bearer; role TUTOR)
  - Response `200` (example)
    ```json
    { "id": "tut_1", "userId": "usr_9", "bio": "...", "subjects": ["Math"], "hourlyRate": 25 }
    ```

- `PUT /tutors/me` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "bio": "I teach algebra", "subjects": ["Math"], "hourlyRate": 30, "languages": ["English"] }
    ```
  - Response `200` (example)
    ```json
    { "id": "tut_1", "bio": "I teach algebra", "subjects": ["Math"], "hourlyRate": 30 }
    ```

### TUT-002 — Manage availability slots

**Business goal**: Maintain accurate tutor availability for reliable bookings.

**User story**: As a tutor, I want to create/update availability slots, so that students can book me.

**Acceptance criteria**
- Slot end time must be after start time.
- Overlapping availability rules are enforced by the service.

**APIs (with samples)**

- `POST /availability/me` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "startTime": "2026-02-20T10:00:00.000Z", "endTime": "2026-02-20T12:00:00.000Z" }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "slot_1", "startTime": "2026-02-20T10:00:00.000Z", "endTime": "2026-02-20T12:00:00.000Z" }
    ```

- `GET /availability/me/slots?from=&to=` (Bearer; role TUTOR)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "slot_1", "startTime": "2026-02-20T10:00:00.000Z", "endTime": "2026-02-20T12:00:00.000Z" }] }
    ```

### TUT-003 — Tutor sessions list

**Business goal**: Provide tutors a clear schedule and history.

**User story**: As a tutor, I want to list my sessions/bookings.

**APIs (with samples)**

- `GET /tutors/me/sessions` (Bearer; role TUTOR)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "bk_123", "status": "CONFIRMED", "startTime": "2026-02-20T10:00:00.000Z" }] }
    ```

- `GET /bookings?tutorId=&page=&pageSize=` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "bk_123", "tutorId": "tut_1" }], "total": 1 }
    ```

### TUT-004 — Booking lifecycle actions (complete/cancel/convert)

**Business goal**: Let tutors execute session lifecycle actions.

**User story**: As a tutor, I want to complete sessions and manage cancellations.

**APIs (with samples)**

- `POST /bookings/:id/complete` (Bearer; roles TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "bookingId": "bk_123", "status": "COMPLETED" }
    ```

- `PATCH /bookings/:id/convert-to-group` (Bearer; roles TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "bookingId": "bk_123", "isGroupSession": true, "maxStudents": 5 }
    ```

### TUT-005 — Create group session

**Business goal**: Support scalable group teaching sessions.

**User story**: As a tutor, I want to create group sessions to teach multiple students.
- **API contract note**
  - Implementation creates the group booking and sets `currentEnrollment=1` by attaching the most recent student from tutor’s existing bookings (see `BookingsService.createGroupSession`). This is important for product/UX alignment.

**APIs (with samples)**

- `POST /bookings/group` (Bearer; roles TUTOR/ADMIN)
  - Request (example)
    ```json
    { "subject": "Math", "startTime": "2026-02-25T10:00:00.000Z", "endTime": "2026-02-25T10:45:00.000Z", "maxStudents": 5, "pricePerStudent": 5 }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "bk_group_1", "isGroupSession": true, "currentEnrollment": 1, "maxStudents": 5 }
    ```

### TUT-006 — Recurring availability templates

**Business goal**: Reduce repetitive setup and improve schedule consistency.

**User story**: As a tutor, I want recurring templates so my schedule is predictable.

**APIs (with samples)**

- `POST /recurring-templates` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "dayOfWeek": 1, "startTime": "10:00", "endTime": "12:00", "title": "Mon mornings", "isActive": true }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "rt_1", "dayOfWeek": 1, "startTime": "10:00", "endTime": "12:00", "isActive": true }
    ```

- `GET /recurring-templates/my` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "rt_1", "dayOfWeek": 1, "startTime": "10:00", "endTime": "12:00", "isActive": true }] }
    ```

### TUT-007 — Waitlist management (tutor view + notify)

**Business goal**: Convert demand into booked sessions.

**User story**: As a tutor, I want to see students waiting and notify them when a slot is available.

**APIs (with samples)**

- `GET /waitlist/tutor` (Bearer; roles TUTOR/ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "wl_1", "studentId": "stu_123", "requestedStartTime": "2026-02-20T10:00:00.000Z" }] }
    ```

- `POST /waitlist/:id/notify` (Bearer; roles TUTOR/ADMIN)
  - Request (example)
    ```json
    { "bookingId": "bk_123" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "notified": true }
    ```

### TUT-008 — Tutor wallet and payouts

**Business goal**: Provide financial transparency to tutors.

**User story**: As a tutor, I want to view wallet balance, ledger, and payouts.

**APIs (with samples)**

- `GET /tutors/me/wallet` (Bearer; role TUTOR)
  - Response `200` (example)
    ```json
    { "available": 1200, "currency": "INR", "holds": 200 }
    ```

- `GET /tutors/me/ledger?cursor=&limit=` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tled_1", "delta": 500, "reason": "SESSION_EARNING", "createdAt": "2026-02-16T10:00:00.000Z" }], "nextCursor": null }
    ```

- `GET /tutors/me/payouts?status=&cursor=&limit=` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "pyo_1", "status": "PAID", "amount": 1000, "paidAt": "2026-02-16T10:00:00.000Z" }], "nextCursor": null }
    ```

### TUT-009 — KYC submission and status

**Business goal**: Ensure regulatory/identity compliance for tutors.

**User story**: As a tutor, I want to submit KYC and track status.

**APIs (with samples)**

- `POST /kyc/submit` (Bearer; role TUTOR; multipart/form-data)
  - Field: `data` (JSON string)
  - Field: `files[]` (documents)
  - Response `200` (example)
    ```json
    { "ok": true, "applicationId": "kyc_1", "status": "SUBMITTED" }
    ```

- `GET /kyc/status` (Bearer; role TUTOR)
  - Response `200` (example)
    ```json
    { "status": "PENDING_REVIEW", "lastSubmittedAt": "2026-02-16T10:00:00.000Z" }
    ```

### TUT-010 — Assignments (create/update/grade/delete)

**Business goal**: Enable structured homework and assessment.

**User story**: As a tutor, I want to create assignments and grade submissions.

**APIs (with samples)**

- `POST /assignments` (Bearer; role TUTOR; multipart/form-data)
  - Response `201/200` (example)
    ```json
    { "id": "asg_1", "title": "Homework 1", "createdAt": "2026-02-16T10:00:00.000Z" }
    ```

- `GET /assignments/tutor` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "asg_1", "title": "Homework 1" }] }
    ```

- `POST /assignments/submissions/:id/grade` (Bearer)
  - Request (example)
    ```json
    { "grade": "A", "feedback": "Well done" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "submissionId": "sub_1", "graded": true }
    ```

### TUT-011 — Study materials (tutor-managed)

**Business goal**: Let tutors distribute learning resources.

**User story**: As a tutor, I want to create study materials and optionally publish them.

**APIs (with samples)**

- `POST /study-materials` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "title": "Algebra notes", "subject": "Math", "isPublic": false }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "mat_1", "title": "Algebra notes", "status": "DRAFT" }
    ```

- `POST /study-materials/finalize` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "id": "mat_1", "fileKey": "study-materials/tut_1/algebra.pdf" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "id": "mat_1", "status": "PUBLISHED" }
    ```

- `POST /study-materials/:id/share` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "studentIds": ["stu_123"], "message": "Please review" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "sharedWith": 1 }
    ```

### TUT-012 — Performance reports

**Business goal**: Track and communicate student performance over time.

**User story**: As a tutor, I want to record performance reports for students.

**APIs (with samples)**

- `POST /performance-reports` (Bearer; role TUTOR)
  - Request (example)
    ```json
    { "studentId": "stu_123", "period": "2026-02", "data": { "score": 85, "notes": "Improving" } }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "pr_1", "studentId": "stu_123", "period": "2026-02" }
    ```

- `GET /performance-reports/my-reports` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "pr_1", "studentId": "stu_123", "period": "2026-02" }] }
    ```

- `GET /performance-reports/student/:studentId` (Bearer)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "pr_1", "period": "2026-02", "data": { "score": 85 } }] }
    ```

---

---

## 6) Admin User Stories (ADM)

### ADM-001 — Admin dashboard summary
**As an** admin, **I want** a dashboard overview of the platform.

- **APIs called**
  - `GET /admin/dashboard` (Bearer + role ADMIN)

**APIs (with samples)**

- `GET /admin/dashboard` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "users": 5400, "tutors": 120, "bookingsToday": 35, "revenueThisMonth": 120000 }
    ```

### ADM-002 — Admin user management (list users, role changes)
**As an** admin, **I want** to manage users and roles.

- **APIs called**
  - `GET /admin/users` (paginated; implemented in `AdminController`)
  - `GET /users` (admin-only list; implemented in `UsersController`)
  - `PATCH /users/:id/role` (admin-only)

**APIs (with samples)**

- `GET /admin/users?page=&pageSize=&q=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "usr_123", "email": "studentA@example.com", "role": "STUDENT", "isBanned": false }], "total": 1 }
    ```

- `PATCH /users/:id/role` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "role": "ADMIN" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "id": "usr_123", "role": "ADMIN" }
    ```

### ADM-003 — Admin tutor moderation (approve/reject)
**As an** admin, **I want** to approve or reject tutor onboarding.

- **APIs called**
  - `GET /admin/tutors?page=&pageSize=&q=&status=` (role ADMIN)
  - `PATCH /admin/tutors/:id/status` body `{ status: TutorStatus }`

**APIs (with samples)**

- `GET /admin/tutors?page=&pageSize=&q=&status=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tut_1", "name": "Tutor One", "status": "PENDING" }], "total": 1 }
    ```

- `PATCH /admin/tutors/:id/status` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "status": "APPROVED" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "id": "tut_1", "status": "APPROVED" }
    ```

### ADM-004 — Admin student management
**As an** admin, **I want** to list and view student records.

- **APIs called**
  - `GET /admin/students` (AdminController)
  - `GET /students` (StudentsController listAll; `q` searches email/grade)
  - `GET /students/:id` (StudentsController getByIdAdmin)

**APIs (with samples)**

- `GET /students?page=&pageSize=&q=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "stu_123", "user": { "email": "studentA@example.com" }, "grade": "11" }], "total": 1 }
    ```

- `GET /students/:id` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "id": "stu_123", "grade": "11", "tokenBalance": 42 }
    ```

### ADM-005 — Admin booking & payment oversight
**As an** admin, **I want** to list bookings and payments.

- **APIs called**
  - `GET /admin/bookings`
  - `GET /admin/payments`
  - Exports (CSV):
    - `GET /admin/bookings/export`
    - `GET /admin/payments/export`
    - `GET /admin/token-ledger/export`

**APIs (with samples)**

- `GET /admin/bookings?page=&pageSize=&q=&status=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "bk_123", "status": "CONFIRMED", "tutorId": "tut_1", "studentId": "stu_123" }], "total": 1 }
    ```

- `GET /admin/payments?page=&pageSize=&q=&status=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "pay_1", "status": "PAID", "amountInMinor": 49900 }], "total": 1 }
    ```

- `GET /admin/bookings/export` (Bearer; role ADMIN)
  - Response `200`: `text/csv` stream

### ADM-006 — Manual bans/unbans + ban ledger
**As an** admin, **I want** to ban/unban users and view ban history.

- **APIs called**
  - `POST /admin/bans` body `{ userId, scope, reason, note? }`
  - `GET /admin/bans/:userId` (list)
  - `GET /admin/bans/:userId/active` (active ban)
  - `POST /admin/bans/:userId/unban` body `{ liftReason? }`
  - `POST /admin/users/:id/unban` (shortcut unban endpoint from `AdminController`)

**APIs (with samples)**

- `POST /admin/bans` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "userId": "usr_123", "scope": "GLOBAL", "reason": "Abuse", "note": "Multiple reports" }
    ```
  - Response `201/200` (example)
    ```json
    { "ok": true, "banId": "ban_1", "userId": "usr_123", "active": true }
    ```

- `POST /admin/bans/:userId/unban` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "userId": "usr_123", "active": false }
    ```

### ADM-007 — PII auto-ban visibility + admin unblock from UI
**As an** admin, **I want** to see blocked users and unblock them from Admin UI.

- **Reference implementation notes**
  - `ADMIN_PAGES_ENHANCEMENT.md`
  - `PII_BAN_SYSTEM_IMPLEMENTATION.md`
- **APIs called**
  - `POST /admin/users/:id/unban`
  - Admin listing endpoints to include ban fields (`isBanned`, `bannedAt`, etc.) via admin services (already implemented).

**APIs (with samples)**

- `POST /admin/users/:id/unban` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "userId": "usr_123", "unbanned": true }
    ```

- (Data expectation) Admin list endpoints (e.g. `GET /admin/users`) include ban fields
  - Response item example
    ```json
    { "id": "usr_123", "email": "studentA@example.com", "isBanned": false, "bannedAt": null, "banReason": null }
    ```

### ADM-008 — Admin adjust student tokens (+/-)
**As an** admin, **I want** to adjust a student’s token balance.

- **APIs called**
  - `POST /admin/tokens/adjust` body `{ studentId, delta, note? }` → `{ ok: true }`
  - `POST /admin/students/tokens/adjust` body `{ studentId, delta, note? }` → `{ ok: true }` (alias)

**APIs (with samples)**

- `POST /admin/tokens/adjust` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "studentId": "stu_123", "delta": 10, "note": "Manual compensation" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### ADM-009 — Admin content management (blogs)
**As an** admin, **I want** to manage blog content.

- **APIs called**
  - `GET /blogs/admin/list` (admin)
  - `POST /blogs` (admin)
  - `PATCH /blogs/:id` (admin)
  - `DELETE /blogs/:id` (admin)

**APIs (with samples)**

- `GET /blogs/admin/list?page=&pageSize=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "blog_1", "title": "How it works", "slug": "how-it-works", "status": "PUBLISHED" }], "total": 1 }
    ```

- `POST /blogs` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "title": "How it works", "slug": "how-it-works", "content": "<html>...</html>" }
    ```
  - Response `201/200` (example)
    ```json
    { "id": "blog_1", "title": "How it works", "slug": "how-it-works" }
    ```

- `PATCH /blogs/:id` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "title": "How it works (updated)" }
    ```
  - Response `200` (example)
    ```json
    { "id": "blog_1", "title": "How it works (updated)", "slug": "how-it-works" }
    ```

- `DELETE /blogs/:id` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### ADM-010 — Admin review moderation
**As an** admin, **I want** to remove inappropriate reviews.

- **APIs called**
  - `DELETE /reviews/:id/admin` (admin)

**APIs (with samples)**

- `DELETE /reviews/:id/admin` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true }
    ```

### ADM-011 — Support ticket operations
**As an** admin, **I want** to triage support tickets.

- **APIs called**
  - `GET /support/tickets/unassigned` (admin)
  - `GET /support/tickets/assigned` (admin)
  - `PATCH /support/tickets/:id/assign` (admin)
  - `PATCH /support/tickets/:id/status` (admin)

**APIs (with samples)**

- `GET /support/tickets/unassigned` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "tkt_1", "subject": "Refund request", "status": "OPEN" }] }
    ```

### ADM-012 — KYC review workflow
**As an** admin, **I want** to review tutor KYC submissions.

- **APIs called**
  - `GET /kyc?status=&page=&pageSize=` (admin)
  - `GET /kyc/admin/:tutorId` (admin)
  - `PATCH /kyc/doc/:docId` body `{ status, notes? }` (admin)

**APIs (with samples)**

- `GET /kyc?status=&page=&pageSize=` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "docId": "doc_1", "tutorId": "tut_1", "status": "PENDING_REVIEW" }], "total": 1 }
    ```

- `PATCH /kyc/doc/:docId` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "status": "APPROVED", "notes": "Verified" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "docId": "doc_1", "status": "APPROVED" }
    ```

### ADM-013 — Payments: refunds and webhooks
**As an** admin, **I want** to refund payments and process payment webhooks.

- **APIs called**
  - `POST /payments/refund` (admin) body `{ paymentId, amountInMinor?, reason? }`
  - `POST /payments/razorpay/webhook` (public, raw-body)

**APIs (with samples)**

- `POST /payments/refund` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "ok": true, "refundId": "rf_1", "paymentId": "pay_1" }
    ```

### ADM-014 — Admin payout operations (manual)
**As an** admin, **I want** to create and manage payouts.

- **APIs called**
  - `GET /admin/payouts`
  - `POST /admin/payouts` body `{ tutorId, amount, reference? }`
  - `PATCH /admin/payouts/:id` body `{ status: "PAID" | "CANCELED" }`
  - `GET /admin/payouts/export`

**APIs (with samples)**

- `POST /admin/payouts` (Bearer; role ADMIN)
  - Response `201/200` (example)
    ```json
    { "id": "pyo_1", "tutorId": "tut_1", "amount": 1000, "status": "PENDING" }
    ```

### ADM-015 — Director-only finance dashboard (balance sheet + export)

**Business goal**: Provide finance visibility for director-level admins.

**User story**: As a director-level admin, I want finance reporting.

**Acceptance criteria**
- Access requires `role=ADMIN` and `isDirector=true`.
- Export endpoint returns CSV.

- **Auth**: `JwtAuthGuard` + `DirectorGuard` (requires `role=ADMIN` and `isDirector=true`)
- **APIs called**
  - `GET /admin/finance/dashboard?period=month|quarter|half|year&asOf=...`
  - `GET /admin/finance/dashboard/export?period=...&asOf=...` (CSV)

**APIs (with samples)**

- `GET /admin/finance/dashboard?period=month&asOf=2026-02-16` (Bearer + DirectorGuard)
  - Response `200` (example)
    ```json
    { "period": "month", "asOf": "2026-02-16", "revenue": 120000, "payouts": 80000, "net": 40000 }
    ```

### ADM-016 — Director-only payout batches and payout webhooks

**Business goal**: Execute controlled payout batches with auditability.

**User story**: As a director-level admin, I want to run payout batches.

- **Auth**: `JwtAuthGuard` + `DirectorGuard` for `/admin/finance/payouts/*`
- **APIs called**
  - `GET /admin/finance/payouts/batches?month=...`
  - `GET /admin/finance/payouts/batches/:batchKey`
  - `POST /admin/finance/payouts/batches/preview` body `{ batchKey, tutorId? }`
  - `POST /admin/finance/payouts/batches/confirm` body `{ batchKey, dryRun? }`
  - `POST /admin/finance/payouts/batches/execute` body `{ batchKey }`
  - `POST /webhooks/payouts/:provider` body `any` (no auth in controller)

### ADM-017 — Director-only tutor balances (holds/releases/adjustments)

**Business goal**: Apply holds/releases/adjustments for payouts and disputes.

**User story**: As a director-level admin, I want to manage tutor balances.

- **Auth**: `JwtAuthGuard` + `DirectorGuard`
- **APIs called**
  - `GET /admin/finance/tutor-balances?tutorId=&month=`
  - `PATCH /admin/finance/tutor-balances/:tutorId/adjust` body `{ amount, type, reason }`
  - `PATCH /admin/finance/tutor-balances/:tutorId/hold` body `{ amount, reason }`
  - `PATCH /admin/finance/tutor-balances/:tutorId/release` body `{ amount, reason }`

### ADM-018 — Finance token ledger corrections (guarding gap)
**As an** admin, **I want** to audit/correct token ledger entries.

- **APIs called**
  - `GET /admin/finance/token-ledger?...` (filters + pagination)
  - `PATCH /admin/finance/token-ledger/:id/correct` body `{ unitPrice, reason? }`
  - `PATCH /admin/finance/token-ledger/:id/reassign-batch` body `{ batchKey }`
- **Important security note**
  - These endpoints **do not declare `JwtAuthGuard`/`DirectorGuard` in the controller** as currently implemented. If this is unintended, treat it as a security bug to fix.

### ADM-019 — Finance reconciliation + tax records (guarding gap)
**As an** admin, **I want** reconciliation uploads and tax record keeping.

- **APIs called**
  - `GET /admin/finance/recon/daily?date=...`
  - `POST /admin/finance/recon/bank/upload` (multipart `file`)
  - `POST /admin/finance/recon/gateway/upload` (multipart `file`)
  - `POST /admin/finance/recon/adjustment` body `{ date, amount, reason }`
  - `GET /admin/finance/tax/summary?month=...`
  - `GET /admin/finance/tax/tds?month=...`
  - `POST /admin/finance/tax/tds/deposit` body `{ month, amount, challanRef }`
  - `POST /admin/finance/tax/gst/itc` body `{ month, itcAmount, notes }`
- **Important security note**
  - These controllers also **do not declare auth guards** in their controllers as currently implemented.

### ADM-020 — Admin audit log
**As an** admin, **I want** to view audit logs, **so that** I can trace sensitive changes.

- **APIs called**
  - `GET /admin/audit?page=&pageSize=&entityType=&from=&to=` (Bearer; role ADMIN)

**APIs (with samples)**

- `GET /admin/audit?page=1&pageSize=20` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "aud_1", "actorUserId": "usr_admin", "action": "TOKENS_ADJUST", "entityType": "STUDENT", "createdAt": "2026-02-16T10:00:00.000Z" }], "total": 1 }
    ```

### ADM-021 — Admin metrics summary
**As an** admin, **I want** a metrics snapshot, **so that** I can monitor platform health.

- **APIs called**
  - `GET /admin/metrics` (Bearer; role ADMIN)

**APIs (with samples)**

- `GET /admin/metrics` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "activeUsers7d": 320, "bookings7d": 210, "conversionRate": 0.12 }
    ```

### ADM-022 — Admin policy configuration management
**As an** admin, **I want** to view/update policy configuration, **so that** business rules can be tuned.

- **APIs called**
  - `GET /admin/policy-config` (Bearer; role ADMIN)
  - `PATCH /admin/policy-config` (Bearer; role ADMIN)

**APIs (with samples)**

- `GET /admin/policy-config` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "cancellation": { "refund48h": 1.0, "refund24to48h": 0.5, "refundUnder24h": 0.0 }, "waitlist": { "enabled": true } }
    ```

- `PATCH /admin/policy-config` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "cancellation": { "refund24to48h": 0.6 } }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "updated": true }
    ```

### ADM-023 — Admin refund processing
**As an** admin, **I want** to review and process refund/transfer requests.

- **APIs called**
  - `GET /refunds/request/pending` (Bearer; role ADMIN)
  - `GET /refunds/transfer/pending` (Bearer; role ADMIN)
  - `POST /refunds/request/:id/process` body `{ approved: boolean, adminNotes?: string }`
  - `POST /refunds/transfer/:id/process` body `{ approved: boolean, adminNotes?: string }`

**APIs (with samples)**

- `GET /refunds/request/pending` (Bearer; role ADMIN)
  - Response `200` (example)
    ```json
    { "items": [{ "id": "rreq_1", "status": "PENDING", "tokenAmount": 10 }] }
    ```

- `POST /refunds/request/:id/process` (Bearer; role ADMIN)
  - Request (example)
    ```json
    { "approved": true, "adminNotes": "Approved per policy" }
    ```
  - Response `200` (example)
    ```json
    { "ok": true, "id": "rreq_1", "status": "APPROVED" }
    ```

---

---

## Appendix — Frontend/Backend mismatches (for QA awareness)

These are endpoints currently called by the frontend (`Frontend/src/services/chatService.ts`, `Frontend/src/services/tutorService.ts`) that are **not implemented** in the backend controllers as-of this document date.

- Chat (admin/broadcast enhancements):
  - `POST /chat/broadcast`
  - `DELETE /chat/messages/:messageId`
  - `POST /chat/conversations/:id/members`
  - `DELETE /chat/conversations/:id/members`
  - `GET /chat/conversations/:id/export`
- Legacy/alternate KYC URLs (frontend fallbacks):
  - `POST /tutors/me/kyc`
  - `GET /tutors/me/kyc/status`
  - `POST /kyc/upload`

The implemented KYC workflow is under `/kyc` (see TUT-009 / ADM-012).

## Appendix — Notes

### Sample objects (reference only)

The API returns Prisma/service-defined objects in many places. When the exact schema is not stable or not explicitly versioned, examples above are provided as **representative shapes** for QA/UI work.

