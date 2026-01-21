# Implemented Requirements → User Stories + API Contracts (Tunect)

**As-of**: 2026-01-21  
**Source of truth**: Implemented backend controllers/services under `backend/src/` (plus a few existing implementation notes: `docs/PHASE4_IMPLEMENTATION_STATUS.md`, `CHAT_SYSTEM_IMPLEMENTATION.md`, `PII_BAN_SYSTEM_IMPLEMENTATION.md`, `ADMIN_PAGES_ENHANCEMENT.md`).

This document **re-expresses what is already implemented** into **numbered user stories**, segregated by:

- **Common** (applies to multiple roles)
- **Student**
- **Tutor**
- **Admin**

For each user story you get:

- **Requirements** (functional requirements already supported by the code)
- **Acceptance criteria**
- **APIs called**
- **API contract** (auth, roles, headers, params, request/response examples, errors)

> Note on numbering: the repository does not contain pre-existing “US-###” identifiers, so the IDs below are **new IDs** derived from implemented features.

---

## Shared / Common API Conventions

### Base URL
- **Local/dev** (typical): `http://localhost:<PORT>`
- Swagger is mounted at `GET /docs` when `NODE_ENV !== 'production'` (see `backend/src/main.ts`).

### Auth
- **Bearer JWT** for most non-public endpoints: `Authorization: Bearer <access_token>`
- Role checks are enforced via:
  - `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('STUDENT'|'TUTOR'|'ADMIN')`
  - Some finance endpoints use `DirectorGuard` (requires `role=ADMIN` **and** `isDirector=true`).
  - Some finance endpoints currently do **not** declare guards in the controller (see Admin Finance stories).

### Global rate limiting
`ThrottlerGuard` is configured globally (default `limit=120` per `ttl=60s`). Some controllers override with `@Throttle(...)`.

### Timezone handling (bookings)
Many booking endpoints accept timezone through:
- Header: `x-timezone: <IANA tz>` e.g. `Asia/Kolkata`
- Or query: `?tz=<IANA tz>`

### Pagination patterns (implemented)
- **Page-based**: `page`, `pageSize` (capped in some endpoints to 100)
- **Cursor-based**: `cursor`, `limit` (messages and wallet endpoints)

### Error shape (NestJS default)
When throwing `BadRequestException`, `ForbiddenException`, etc., errors typically look like:

```json
{
  "statusCode": 400,
  "message": "Human readable message",
  "error": "Bad Request"
}
```

---

## Common User Stories (COM)

### COM-001 — Email/password authentication
**As a** user, **I want** to register/login and receive JWTs, **so that** I can access protected features.

- **Requirements**
  - Register email/password.
  - Login and receive `access_token` + `refresh_token`.
  - Refresh tokens.
  - Logout (logical; returns `{ ok: true }`).
  - Preprod allowlist can block auth if `APP_ENV=preprod` and email not allowed.
- **Acceptance criteria**
  - Registering an existing email returns 409.
  - Login with wrong credentials returns 401.
  - Refresh with invalid/expired token returns 401.
- **APIs called**
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
- **API contract**
  - **POST `/auth/register`** (public)
    - **Body**
      - `email` (string)
      - `password` (string, min 6)
      - `role` (optional: `STUDENT|TUTOR`; defaults to `STUDENT`)
    - **Response 201**
      - `{ id, email, role }`
  - **POST `/auth/login`** (public)
    - **Body**
      - `email` (string)
      - `password` (string)
    - **Response 200** (from `AuthService.login`)
      - `access_token` (string)
      - `refresh_token` (string)
      - `user` `{ id, email, role, isDirector }`
  - **POST `/auth/refresh`** (public)
    - **Body**: `{ refreshToken: string }`
    - **Response 200** (from `AuthService.refresh`)
      - `access_token`, `refresh_token`
      - `user` (expanded user + `student` + `tutor` objects when present)
  - **POST `/auth/logout`** (Bearer)
    - **Response 200**: `{ ok: true }`

### COM-002 — Google OAuth login + post-OAuth persona selection
**As a** user, **I want** to login via Google and then choose Student/Tutor persona, **so that** my account has the right role.

- **Requirements**
  - OAuth start/callback endpoints exist under `auth`.
  - Persona/role can be chosen after OAuth via:
    - `POST /auth/choose-role` (Bearer)
    - `POST /profiles/choose-role` (Bearer) — also returns a fresh `access_token`.
- **Acceptance criteria**
  - User without persona gets redirected to `/choose-role`.
  - Choosing role updates JWT role and returns next route.
- **APIs called**
  - `GET /auth/google/start`
  - `GET /auth/google`
  - `GET /auth/google/callback`
  - `POST /auth/choose-role`
  - `POST /profiles/choose-role`
- **API contract**
  - **POST `/auth/choose-role`** (Bearer)
    - **Body**: `{ role: "STUDENT" | "TUTOR" }`
    - **Response 200**: `{ ok: true, access_token, next }`
  - **POST `/profiles/choose-role`** (Bearer)
    - **Body**: `{ role: "STUDENT" | "TUTOR" }`
    - **Response 200**: `<ProfilesService.chooseRole result> + access_token`

### COM-003 — Account profile management (User-level)
**As a** logged-in user, **I want** to view/update my account profile and password, **so that** I can manage my account.

- **Requirements**
  - Fetch current user (`/users/me`)
  - Update user fields (`/users/me`)
  - Change password (`/users/me/password`)
- **Acceptance criteria**
  - Must be authenticated.
  - Changing password requires valid current password if one exists (implementation detail in service).
- **APIs called**
  - `GET /users/me`
  - `PATCH /users/me`
  - `PATCH /users/me/password`
- **API contract**
  - **GET `/users/me`** (Bearer)
    - **Response 200**: user object (service-defined)
  - **PATCH `/users/me`** (Bearer)
    - **Body**: `{ email?, name?, avatarUrl?, preferredCurrency? }`
    - **Response 200**: updated user object (service-defined)
  - **PATCH `/users/me/password`** (Bearer)
    - **Body**: `{ currentPassword?, newPassword }`
    - **Response 200**: `{ ok: true }` or updated user/session (service-defined)

### COM-004 — Notifications inbox
**As a** logged-in user, **I want** to see and manage my notifications, **so that** I don’t miss important events.

- **APIs called**
  - `GET /notifications/my?unreadOnly=true|false`
  - `GET /notifications/my/unread-count`
  - `PATCH /notifications/:id/read`
  - `POST /notifications/mark-all-read`
  - `DELETE /notifications/:id`
- **API contract**
  - All are **Bearer**.
  - Responses are service-defined objects (notification list, counts, etc.).

### COM-005 — System health endpoints
**As an** operator, **I want** health endpoints to verify service readiness.

- **APIs called**
  - `GET /health` → `{ ok: true, ts }`
  - `GET /ready` → `{ status: "ok" }` after DB ping

### COM-006 — Public marketing content (blogs + stats)
**As a** visitor, **I want** to view public stats and blogs.

- **APIs called**
  - `GET /stats/public`
  - `GET /blogs?page=&pageSize=`
  - `GET /blogs/:slug`

### COM-007 — Referrals
**As a** user, **I want** to generate referral invites and view referral stats.

- **APIs called**
  - `POST /referrals` (Bearer) body: `{ referredEmail }`
  - `GET /referrals/my-code` (Bearer)
  - `GET /referrals/my-referrals` (Bearer)
  - `GET /referrals/validate?code=...` (public)

### COM-008 — Real-time classroom tooling (LiveKit token + Whiteboard)
**As a** session participant, **I want** session tools for video/whiteboard.

- **APIs called**
  - `POST /livekit/token` (Bearer) body: `{ bookingId }`
  - `GET /whiteboard/:bookingId` (Bearer)
  - `POST /whiteboard/:bookingId` (Bearer) body: `any`
  - `POST /whiteboard/:bookingId/export` (Bearer)

---

## Student User Stories (STU)

### STU-001 — Discover tutors (list/search/trending/filter options)
**As a** student, **I want** to browse and search tutors with filters, **so that** I can find the best tutor.

- **APIs called**
  - `GET /tutors`
  - `GET /tutors/search`
  - `GET /tutors/trending`
  - `GET /tutors/filters/options`
  - `GET /search/tutors` (alternate search API)
  - `GET /search/subjects`
- **API contract (high-signal)**
  - **GET `/tutors`** (public)
    - **Query**: `page`, `pageSize`, `subject`, `class`, `language`, `sortBy`, `sortOrder`
    - **Response 200**: `{ items: TutorPublic[], total, page, pageSize }`
  - **GET `/search/tutors`** (public)
    - **Query** (from `SearchTutorsDto`): `subject?`, `minRate?`, `maxRate?`, `from?`, `to?`, `q?`, `page?`, `pageSize?`
    - **Response 200**: `{ items: [...], meta: { page, pageSize, total, totalPages } }` (service-defined; controller returns empty `{items, meta...}` on failure)

### STU-002 — View tutor profile + activity + availability
**As a** student, **I want** to view tutor details and availability, **so that** I can pick a slot.

- **APIs called**
  - `GET /tutors/:idOrTid`
  - `GET /tutors/:id/activity`
  - `GET /availability/tutors/:tutorId`
  - `GET /availability/tutors/:tutorId/bookable?from=&to=&durationMin=&stepMin=`
  - `GET /tutors/:id/availability?from=&to=` (Bearer)

### STU-003 — Favorite tutors
**As a** student, **I want** to favorite tutors, **so that** I can revisit them quickly.

- **APIs called** (Bearer + role STUDENT)
  - `GET /favorites/my`
  - `POST /favorites/:tutorId`
  - `DELETE /favorites/:tutorId`
  - `GET /favorites/check/:tutorId` → `{ isFavorite }`

### STU-004 — Create paid bookings (token-charged)
**As a** student, **I want** to create a paid booking, **so that** I can schedule a session.

- **Requirements**
  - Tutor must be `APPROVED`.
  - Must be inside availability (explicit slots or recurring templates).
  - No overlap with tutor or student bookings.
  - Tokens are deducted via token ledger.
  - Chat conversation may be auto-triggered on creation.
- **Acceptance criteria**
  - If overlap exists → 400.
  - If tutor not approved → 400.
  - If insufficient tokens → 400.
- **APIs called**
  - `POST /bookings` (Bearer; roles STUDENT/ADMIN)
- **API contract**
  - **POST `/bookings`**
    - **Headers**: optional `x-timezone`
    - **Query**: optional `tz`
    - **Body** (from `CreateBookingDto`): `{ tutorId, studentId?, startTime?, endTime?, notes?, isDemo=false }`
    - **Response 201**: booking row (Prisma `Booking`), with `meetingUrl` later ensured (`livekit:<bookingId>`)

### STU-005 — Create demo bookings (free)
**As a** student, **I want** to book a free demo session, **so that** I can evaluate a tutor.

- **Requirements**
  - One demo per student+tutor (conflict returns 409).
  - If slot is outside availability or overlaps, system auto-adds a **waitlist entry** and creates a `PENDING` demo booking (no times).
- **APIs called**
  - `POST /bookings/demo` (Bearer; roles STUDENT/ADMIN)
  - `GET /bookings/demo-status/:tutorId`
  - `POST /bookings/demo-status/bulk`
- **API contract**
  - **POST `/bookings/demo`**
    - **Body**: same `CreateBookingDto` but `isDemo=true` (controller sets it).
    - **Response 201**
      - If scheduled immediately: `Booking` with `status=CONFIRMED` + times
      - Else: `Booking` with `status=PENDING`, no times (and a waitlist record created)
  - **GET `/bookings/demo-status/:tutorId`** → `{ used: boolean }`
  - **POST `/bookings/demo-status/bulk`** body `{ tutorIds: string[] }` → `{ [tutorId]: boolean }`

### STU-006 — Assign a slot to a pending booking (demo or paid)
**As a** student, **I want** to assign start/end time to a pending booking, **so that** it becomes a scheduled session.

- **APIs called**
  - `PATCH /bookings/:id/assign-slot` (Bearer; roles STUDENT/TUTOR/ADMIN)
- **API contract**
  - **PATCH `/bookings/:id/assign-slot`**
    - **Body** (from `AssignDemoSlotDto`): `{ startTime, endTime, notes? }`
    - **Response 200**: updated `Booking` row

### STU-007 — Reschedule a booking (one-time policy)
**As a** student, **I want** to reschedule a booking, **so that** I can handle conflicts.

- **APIs called**
  - `PATCH /bookings/:id/reschedule` (Bearer; role STUDENT)
- **API contract**
  - **Body** (from `RescheduleBookingDto`): `{ startTime, endTime, notes? }`
  - **Response 200**: updated `Booking` (service enforces policy and availability)

### STU-008 — Cancel a booking (refund policy)
**As a** student, **I want** to cancel a booking and receive refunds based on policy.

- **Implemented policy** (from bookings service)
  - If **group session** and student cancels: **no refund**.
  - Else:
    - \( \ge 48h \): 100% refund
    - \( 24-48h \): 50% refund (floored)
    - \( < 24h \): 0% refund
- **APIs called**
  - `DELETE /bookings/:id` (Bearer; roles STUDENT/TUTOR/ADMIN)
- **Response 200**: updated booking with `status=CANCELED` (plus token ledger refund entries when applicable)

### STU-009 — View my bookings + booking details + next session
**As a** student, **I want** to view my bookings and session details including meeting links.

- **APIs called**
  - `GET /students/my-bookings` (Bearer; role STUDENT)
  - `GET /bookings` (Bearer; role STUDENT/TUTOR/ADMIN) with filters
  - `GET /bookings/next` (Bearer; role STUDENT/ADMIN)
  - `GET /bookings/:id/details` (Bearer; role STUDENT/TUTOR/ADMIN)
- **API contract (high-signal)**
  - **GET `/bookings/:id/details`** returns:
    - `id, startTime, endTime, status`
    - `meetingUrl` (ensured, fallback `livekit:<id>`)
    - `meetingProvider`
    - `tutor { id, name, email }`
    - `student { id, name, email }`
    - `isDemo`, `isGroupSession`

### STU-010 — Group sessions (browse/join/leave/participants)
**As a** student, **I want** to join group sessions when available.

- **APIs called**
  - `GET /bookings/group/available`
  - `POST /bookings/:id/join`
  - `DELETE /bookings/:id/leave`
  - `GET /bookings/:id/participants`
- **API contract (high-signal)**
  - **GET `/bookings/group/available`** (Bearer; roles STUDENT/TUTOR/ADMIN)
    - **Query**: `subject?`, `startDate?`, `endDate?`
    - **Response 200**: list of bookings where `isGroupSession=true`, `status=CONFIRMED`, `currentEnrollment < maxStudents`, `startTime > now`
  - **POST `/bookings/:id/join`** (Bearer; roles STUDENT/ADMIN)
    - Charges `ceil(pricePerStudent)` tokens, creates token ledger delta and participant record.
  - **DELETE `/bookings/:id/leave`** (Bearer; roles STUDENT/ADMIN)
    - Refunds `ceil(pricePerStudent)` tokens and removes participant record.
  - **GET `/bookings/:id/participants`**
    - Returns `[{ id, name, email, avatarUrl }]`

### STU-011 — Waitlist (join/view/book/remove)
**As a** student, **I want** to join a waitlist when I can’t book, and book when notified.

- **Important**: waitlist endpoints are gated by env `ENABLE_WAITLIST=true` (otherwise 503).
- **APIs called**
  - `POST /waitlist`
  - `GET /waitlist/my`
  - `POST /waitlist/:id/book`
  - `DELETE /waitlist/:id`
- **API contract**
  - **POST `/waitlist`** body (from `AddToWaitlistDto`): `{ tutorId, requestedStartTime, requestedEndTime?, subject?, priority?, notes? }`

### STU-012 — Tokens & payments history
**As a** student, **I want** to view token balances and history.

- **APIs called** (Bearer)
  - `GET /students/me`
  - `PATCH /students/me` (grade update)
  - `GET /students/me/tokens`
  - `GET /students/me/tokens/ledger?page=&pageSize=`
  - `GET /students/me/payments?page=&pageSize=`
  - `GET /students/me/token-balances`
  - `GET /students/me/token-ledger`

### STU-013 — Buy tokens via Razorpay and retrieve receipts
**As a** student, **I want** to purchase tokens, **so that** I can book sessions and chat.

- **APIs called**
  - `POST /payments/order` (Bearer)
  - `POST /payments/verify` (Bearer)
  - `GET /payments/:id` (Bearer)
  - `GET /payments/:id/receipt` (Bearer; streams PDF)
- **API contract (high-signal)**
  - **POST `/payments/order`**
    - **Body** (from `CreateOrderDto`): `{ tutorId, tokens (min 5), notes?, displayCurrency? }`
  - **POST `/payments/verify`**
    - **Body** (from `VerifyPaymentDto`): `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
  - **GET `/payments/:id/receipt`**
    - **Response 200**: `application/pdf` stream

### STU-014 — In-app chat + message moderation + PII auto-ban (implemented)
**As a** student, **I want** to message tutors inside the app (token gated), **so that** I can coordinate about sessions safely.

- **Implemented** (see `CHAT_SYSTEM_IMPLEMENTATION.md`, `PII_BAN_SYSTEM_IMPLEMENTATION.md`, and controller `backend/src/messages/messages.controller.ts`)
  - Post messages with max length 2000.
  - Threads/conversations listing, archive/unarchive.
  - Unread count endpoint(s).
  - PII detection: after 3 violations user is banned and funds forfeited; messages containing PII are blocked.
- **APIs called**
  - `GET /chat/conversations`
  - `GET /chat/thread/:id` (and alias `/chat/threads/:id`)
  - `POST /chat` (post via DTO)
  - `POST /chat/conversations/:id/messages` (post by conversation id)
  - `GET /chat/unread_count` (and alias `/chat/unread-count`)
- **API contract**
  - **POST `/chat`** (Bearer)
    - **Body** (from `PostMessageDto`): `{ conversationId?, bookingId?, peerId?, text }`
    - **Errors**:
      - 403 if token-gated and token balance exhausted (service behavior)
      - 403/401 if banned or unauthorized (service behavior)

### STU-015 — Reviews
**As a** student, **I want** to review a completed session.

- **APIs called**
  - `POST /reviews` (Bearer) body: `{ bookingId, rating (1-5), comment? }`
  - `GET /reviews/me` (Bearer)
  - `DELETE /reviews/:id` (Bearer; deletes own)
  - `GET /reviews/tutor/:tutorId` (public)
  - `GET /reviews/featured` (public)

### STU-016 — Assignments (student view + submit)
**As a** student, **I want** to see assignments and submit solutions.

- **APIs called**
  - `GET /assignments/student` (Bearer)
  - `GET /assignments/:id` (Bearer)
  - `POST /assignments/:id/submit` (Bearer, multipart/form-data)
- **API contract**
  - **POST `/assignments/:id/submit`**
    - **Consumes**: `multipart/form-data`
    - **Fields**:
      - `notes` (string)
      - `file` (optional binary)

### STU-017 — Session notes (view + approve)
**As a** student, **I want** session notes after my booking, **so that** I can revise.

- **APIs called**
  - `GET /session-notes/booking/:bookingId`
  - `GET /session-notes/my-notes`
  - `PUT /session-notes/:noteId/approve`
  - `POST /session-notes/booking/:bookingId/generate-ai`
  - `PUT /session-notes/:noteId/approve-ai`

### STU-018 — Learning goals and milestones
**As a** student, **I want** to set goals and track milestones.

- **APIs called**
  - `POST /learning-goals`
  - `GET /learning-goals/my`
  - `GET /learning-goals/:goalId`
  - `PUT /learning-goals/:goalId`
  - `DELETE /learning-goals/:goalId`
  - `POST /learning-goals/:goalId/milestones`
  - `PUT /learning-goals/milestones/:milestoneId`
  - `DELETE /learning-goals/milestones/:milestoneId`

### STU-019 — Certificates
**As a** student, **I want** to see certificates I earned or can earn.

- **APIs called**
  - `GET /certificates/my`
  - `GET /certificates/eligible`
  - `GET /certificates/subject/:subject`
  - `GET /certificates/:certificateId`

### STU-020 — Progress summary
**As a** student, **I want** to see progress stats like total hours.

- **APIs called**
  - `GET /student-progress/me`
  - `GET /student-progress/me/total-hours` → `{ totalHours }`

### STU-021 — Study materials (public) + download tracking
**As a** student, **I want** to access public study materials and track downloads.

- **APIs called**
  - `GET /study-materials/public?subject=...`
  - `GET /study-materials/:id`
  - `POST /study-materials/:id/download`

---

## Tutor User Stories (TUT)

### TUT-001 — Tutor profile (view/update)
**As a** tutor, **I want** to manage my tutor profile.

- **APIs called** (Bearer)
  - `GET /tutors/me`
  - `PUT /tutors/me`
- **API contract (high-signal)**
  - **PUT `/tutors/me`** body supports (as implemented in `TutorsService.updateMe`):
    - `name?` (updates user)
    - `bio?`, `summary?`, `qualifications?`
    - `subjects?` (string[])
    - `languages?` (string[])
    - `degrees?` (string[])
    - `classesTeach?` (string[])
    - `yearsExperience?` (number)
    - `hourlyRate?` (number)
    - `country?` (string)

### TUT-002 — Manage availability slots
**As a** tutor, **I want** to create/update availability slots, **so that** students can book me.

- **APIs called** (Bearer + role TUTOR)
  - `POST /availability/me` body `{ startTime, endTime, tzOffsetMinutes? }`
  - `GET /availability/me`
  - `GET /availability/me/slots?from=&to=`
  - Bulk upsert aliases:
    - `PATCH /availability/me`
    - `PUT /availability/me`
    - `PATCH /availability/me/slots`
    - `PUT /availability/me/slots`
    - `POST /availability/slots`
  - `PATCH /availability/me/:id`
  - `DELETE /availability/me/:id`

### TUT-003 — Tutor sessions list
**As a** tutor, **I want** to list my sessions/bookings.

- **APIs called**
  - `GET /tutors/me/sessions` (Bearer)
  - `GET /bookings` (Bearer; filter by tutorId)

### TUT-004 — Booking lifecycle actions (complete/cancel/convert)
**As a** tutor, **I want** to complete sessions and manage cancellations.

- **APIs called**
  - `POST /bookings/:id/complete` (roles TUTOR/ADMIN)
  - `DELETE /bookings/:id` (roles STUDENT/TUTOR/ADMIN)
  - `PATCH /bookings/:id/convert-to-group` (roles TUTOR/ADMIN)

### TUT-005 — Create group session
**As a** tutor, **I want** to create group sessions to teach multiple students.

- **APIs called**
  - `POST /bookings/group` (roles TUTOR/ADMIN)
- **API contract note**
  - Implementation creates the group booking and sets `currentEnrollment=1` by attaching the most recent student from tutor’s existing bookings (see `BookingsService.createGroupSession`). This is important for product/UX alignment.

### TUT-006 — Recurring availability templates
**As a** tutor, **I want** recurring templates so my schedule is predictable.

- **APIs called** (Bearer + role TUTOR)
  - `POST /recurring-templates` body `{ dayOfWeek(0-6), startTime(HH:MM), endTime(HH:MM), title?, isActive? }`
  - `GET /recurring-templates/my`
  - `GET /recurring-templates/active`
  - `PUT /recurring-templates/:id`
  - `PATCH /recurring-templates/:id`
  - `PATCH /recurring-templates/:id/toggle`
  - `DELETE /recurring-templates/:id`
  - `POST /recurring-templates/:id/generate`
  - `GET /recurring-templates/:id/bookings`

### TUT-007 — Waitlist management (tutor view + notify)
**As a** tutor, **I want** to see students waiting and notify them when a slot is available.

- **APIs called**
  - `GET /waitlist/tutor` (role TUTOR/ADMIN)
  - `POST /waitlist/:id/notify` (role TUTOR/ADMIN) body `{ bookingId }`

### TUT-008 — Tutor wallet and payouts
**As a** tutor, **I want** to view wallet balance, ledger, and payouts.

- **APIs called**
  - `GET /tutors/me/wallet`
  - `GET /tutors/me/ledger?cursor=&limit=`
  - `GET /tutors/me/payouts?status=&cursor=&limit=`

### TUT-009 — KYC submission and status
**As a** tutor, **I want** to submit KYC and track status.

- **APIs called**
  - `POST /kyc` body `{ docType, url, notes? }`
  - `GET /kyc/me`
  - `POST /kyc/submit` (multipart; `data` json + files[])
  - `GET /kyc/status`

### TUT-010 — Assignments (create/update/grade/delete)
**As a** tutor, **I want** to create assignments and grade submissions.

- **APIs called**
  - `POST /assignments` (multipart; `CreateAssignmentDto` + optional file)
  - `GET /assignments/tutor`
  - `PUT /assignments/:id`
  - `DELETE /assignments/:id`
  - `POST /assignments/submissions/:id/grade`

### TUT-011 — Study materials (tutor-managed)
**As a** tutor, **I want** to create study materials and optionally publish them.

- **APIs called**
  - `POST /study-materials` (role TUTOR)
  - `GET /study-materials/my`
  - `PUT /study-materials/:id`
  - `DELETE /study-materials/:id`

### TUT-012 — Performance reports
**As a** tutor, **I want** to record performance reports for students.

- **APIs called**
  - `POST /performance-reports` body `{ studentId, period, data }`
  - `GET /performance-reports/my-reports`
  - `GET /performance-reports/student/:studentId`

---

## Admin User Stories (ADM)

### ADM-001 — Admin dashboard summary
**As an** admin, **I want** a dashboard overview of the platform.

- **APIs called**
  - `GET /admin/dashboard` (Bearer + role ADMIN)

### ADM-002 — Admin user management (list users, role changes)
**As an** admin, **I want** to manage users and roles.

- **APIs called**
  - `GET /admin/users` (paginated; implemented in `AdminController`)
  - `GET /users` (admin-only list; implemented in `UsersController`)
  - `PATCH /users/:id/role` (admin-only)

### ADM-003 — Admin tutor moderation (approve/reject)
**As an** admin, **I want** to approve or reject tutor onboarding.

- **APIs called**
  - `GET /admin/tutors?page=&pageSize=&q=&status=` (role ADMIN)
  - `PATCH /admin/tutors/:id/status` body `{ status: TutorStatus }`

### ADM-004 — Admin student management
**As an** admin, **I want** to list and view student records.

- **APIs called**
  - `GET /admin/students` (AdminController)
  - `GET /students` (StudentsController listAll; `q` searches email/grade)
  - `GET /students/:id` (StudentsController getByIdAdmin)

### ADM-005 — Admin booking & payment oversight
**As an** admin, **I want** to list bookings and payments.

- **APIs called**
  - `GET /admin/bookings`
  - `GET /admin/payments`
  - Exports (CSV):
    - `GET /admin/bookings/export`
    - `GET /admin/payments/export`
    - `GET /admin/token-ledger/export`

### ADM-006 — Manual bans/unbans + ban ledger
**As an** admin, **I want** to ban/unban users and view ban history.

- **APIs called**
  - `POST /admin/bans` body `{ userId, scope, reason, note? }`
  - `GET /admin/bans/:userId` (list)
  - `GET /admin/bans/:userId/active` (active ban)
  - `POST /admin/bans/:userId/unban` body `{ liftReason? }`
  - `POST /admin/users/:id/unban` (shortcut unban endpoint from `AdminController`)

### ADM-007 — PII auto-ban visibility + admin unblock from UI
**As an** admin, **I want** to see blocked users and unblock them from Admin UI.

- **Reference implementation notes**
  - `ADMIN_PAGES_ENHANCEMENT.md`
  - `PII_BAN_SYSTEM_IMPLEMENTATION.md`
- **APIs called**
  - `POST /admin/users/:id/unban`
  - Admin listing endpoints to include ban fields (`isBanned`, `bannedAt`, etc.) via admin services (already implemented).

### ADM-008 — Admin adjust student tokens (+/-)
**As an** admin, **I want** to adjust a student’s token balance.

- **APIs called**
  - `POST /admin/tokens/adjust` body `{ studentId, delta, note? }` → `{ ok: true }`

### ADM-009 — Admin content management (blogs)
**As an** admin, **I want** to manage blog content.

- **APIs called**
  - `GET /blogs/admin/list` (admin)
  - `POST /blogs` (admin)
  - `PATCH /blogs/:id` (admin)
  - `DELETE /blogs/:id` (admin)

### ADM-010 — Admin review moderation
**As an** admin, **I want** to remove inappropriate reviews.

- **APIs called**
  - `DELETE /reviews/:id/admin` (admin)

### ADM-011 — Support ticket operations
**As an** admin, **I want** to triage support tickets.

- **APIs called**
  - `GET /support/tickets/unassigned` (admin)
  - `GET /support/tickets/assigned` (admin)
  - `PATCH /support/tickets/:id/assign` (admin)
  - `PATCH /support/tickets/:id/status` (admin)

### ADM-012 — KYC review workflow
**As an** admin, **I want** to review tutor KYC submissions.

- **APIs called**
  - `GET /kyc?status=&page=&pageSize=` (admin)
  - `GET /kyc/admin/:tutorId` (admin)
  - `PATCH /kyc/doc/:docId` body `{ status, notes? }` (admin)

### ADM-013 — Payments: refunds and webhooks
**As an** admin, **I want** to refund payments and process payment webhooks.

- **APIs called**
  - `POST /payments/refund` (admin) body `{ paymentId, amountInMinor?, reason? }`
  - `POST /payments/razorpay/webhook` (public, raw-body)

### ADM-014 — Admin payout operations (manual)
**As an** admin, **I want** to create and manage payouts.

- **APIs called**
  - `GET /admin/payouts`
  - `POST /admin/payouts` body `{ tutorId, amount, reference? }`
  - `PATCH /admin/payouts/:id` body `{ status: "PAID" | "CANCELED" }`
  - `GET /admin/payouts/export`

### ADM-015 — Director-only finance dashboard (balance sheet + export)
**As a** director-level admin, **I want** finance reporting.

- **Auth**: `JwtAuthGuard` + `DirectorGuard` (requires `role=ADMIN` and `isDirector=true`)
- **APIs called**
  - `GET /admin/finance/dashboard?period=month|quarter|half|year&asOf=...`
  - `GET /admin/finance/dashboard/export?period=...&asOf=...` (CSV)

### ADM-016 — Director-only payout batches and payout webhooks
**As a** director-level admin, **I want** to run payout batches.

- **Auth**: `JwtAuthGuard` + `DirectorGuard` for `/admin/finance/payouts/*`
- **APIs called**
  - `GET /admin/finance/payouts/batches?month=...`
  - `GET /admin/finance/payouts/batches/:batchKey`
  - `POST /admin/finance/payouts/batches/preview` body `{ batchKey, tutorId? }`
  - `POST /admin/finance/payouts/batches/confirm` body `{ batchKey, dryRun? }`
  - `POST /admin/finance/payouts/batches/execute` body `{ batchKey }`
  - `POST /webhooks/payouts/:provider` body `any` (no auth in controller)

### ADM-017 — Director-only tutor balances (holds/releases/adjustments)
**As a** director-level admin, **I want** to manage tutor balances.

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

---

## Appendix — File attachments for chat messages

### COM-009 — Upload and manage message attachments
**As a** chat user, **I want** to attach files to messages where supported.

- **APIs called** (Bearer)
  - `POST /attachments/upload/:messageId` (multipart `files[]`, max 5, 10MB each)
  - `GET /attachments/message/:messageId`
  - `DELETE /attachments/:id`

