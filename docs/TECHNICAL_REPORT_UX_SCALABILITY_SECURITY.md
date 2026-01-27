# Tunect Platform — Technical Report
## UX, Scalability, Security, API Protection, Caching & Related Parameters

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Scope:** Backend (NestJS), Frontend (React/Vite), Infra (Vercel, PostgreSQL, LiveKit, Razorpay)

---

## 1. User Experience (UX)

### 1.1 Loading States & Feedback
| Area | Implementation | Status |
|------|----------------|--------|
| **Global page loader** | `Loader` component (`Loader.tsx`) with `fullScreen`, `size`, `message` | ✅ |
| **Per-section loading** | Student dashboard: separate states for tokens, next booking, unread, recommended, stats | ✅ |
| **Suspense + lazy** | 60+ route-level `React.lazy()` imports with shared `Suspense` fallback (`<Spinner />`) | ✅ |
| **Button loading** | `ConfirmDialog` supports `isLoading`; forms use `saving` / `loading` states | ✅ |
| **Empty states** | Token balance, bookings, favorites, etc. show “No X yet” + CTA | ✅ |

### 1.2 Error Handling & Toasts
| Area | Implementation | Status |
|------|----------------|--------|
| **Toast context** | `ToastContext` with `showSuccess`, `showError`, `showWarning`, `showInfo` | ✅ |
| **API errors** | `err?.response?.data?.message` surfaced in toasts across bookings, profile, cart, etc. | ✅ |
| **Auth errors** | 401 → token refresh retry; on failure → `auth:unauthorized` + logout | ✅ |

### 1.3 Search & Input UX
| Area | Implementation | Status |
|------|----------------|--------|
| **Debounce** | `useDebounced` (350 ms) for Find Tutors text search; reduces API calls while typing | ✅ |
| **Client-side filtering** | Admin students, Find Tutors: filter already-fetched results when appropriate | ✅ |
| **Placeholders & labels** | Form placeholders and labels used across profile, checkout, availability | ✅ |

### 1.4 Navigation & Layout
| Area | Implementation | Status |
|------|----------------|--------|
| **Role-based nav** | Navbar items vary by `STUDENT` / `TUTOR` / `ADMIN` | ✅ |
| **Deep links** | Student/tutor sessions, messages, bookings, profile, etc. | ✅ |
| **SPA routing** | `react-router-dom`; Vercel rewrites exclude `/assets/` and `/api/` for correct MIME serving | ✅ |

### 1.5 Gaps / Recommendations
- **Skeleton loaders:** Replace generic spinners with skeletons on list/dashboard sections where possible.
- **Offline / retry:** No explicit offline detection or “Retry” on failed fetches; consider adding.
- **Accessibility:** Audit focus management, ARIA, and keyboard navigation for modals and forms.

---

## 2. Scalability

### 2.1 Database
| Area | Implementation | Status |
|------|----------------|--------|
| **ORM** | Prisma with PostgreSQL | ✅ |
| **Indexes** | 100+ `@@index` in schema (e.g. `bookingId`, `studentId`, `tutorId`, `status`, `createdAt`, composite) | ✅ |
| **Query shape** | `take`/`skip` pagination, `where` filters, `orderBy`; token-balance style optimizations (e.g. `balance > 0`, `take: 50`) | ✅ |
| **Slow-query logging** | Dev-only: Prisma `$on('query')` logs >100 ms / warns >200 ms | ✅ |
| **Connection lifecycle** | `onModuleInit` → `$connect`; `enableShutdownHooks` for graceful shutdown | ✅ |

### 2.2 API & Pagination
| Area | Implementation | Status |
|------|----------------|--------|
| **Pagination** | `page`, `pageSize` (often capped, e.g. 100) on list endpoints (bookings, students, tutors, etc.) | ✅ |
| **Response shape** | Many list APIs return `{ items, total }` or `{ items, total, page, pageSize }` | ✅ |

### 2.3 Frontend
| Area | Implementation | Status |
|------|----------------|--------|
| **Code splitting** | Route-level `lazy()` for all major pages | ✅ |
| **Bundle size** | Vite build; shared chunks for vendor + app | ✅ |

### 2.4 Gaps / Recommendations
- **Connection pooling:** Rely on DB provider (e.g. Railway/RDS) pooling; document recommended pool size.
- **Caching:** Backend uses in-memory cache only (see §4). For multi-instance, introduce Redis.
- **Read replicas:** Not used; consider for read-heavy endpoints (search, listings) if needed.
- **Horizontal scaling:** Stateless API; scale via process replicas behind a load balancer.

---

## 3. Security

### 3.1 Authentication & Authorization
| Area | Implementation | Status |
|------|----------------|--------|
| **JWT** | Access + refresh tokens; Passport `jwt` strategy | ✅ |
| **Guards** | `JwtAuthGuard` (global-style usage); `RolesGuard` + `@Roles('ADMIN'|'STUDENT'|'TUTOR')` | ✅ |
| **Password hashing** | `bcrypt` (rounds 10) for register, login, password change | ✅ |
| **Token refresh** | `POST /auth/refresh`; frontend retries 401 with new token, then logout on failure | ✅ |

### 3.2 PII & Encryption
| Area | Implementation | Status |
|------|----------------|--------|
| **Field-level encryption** | `EncryptResponseInterceptor` + `EncryptionService` (AES-256-GCM) | ✅ |
| **Encrypted fields** | `email`, `phone`, `address`, `user.email`, `user.phone`, `tutor`/`student` variants | ✅ |
| **Exclusions** | Names not encrypted; ADMIN / internal testers (allowlist) can receive plain PII where configured | ✅ |
| **Public PII routes** | `/tutors`, `/tutors/search`, `/tutors/trending`, etc. always encrypt PII | ✅ |
| **Client decryption** | Axios response interceptor using `ENCRYPTION_KEY` (Web Crypto API) | ✅ |

### 3.3 HTTP & Headers
| Area | Implementation | Status |
|------|----------------|--------|
| **Helmet** | Enabled; `crossOriginResourcePolicy: 'cross-origin'`; CSP disabled for video | ✅ |
| **CORS** | Allowlist of origins (`tunectnow.com`, `*.preprod.tunectnow.com`, localhost); credentials | ✅ |
| **Body size** | `bodyParser.json({ limit: '1mb' })` | ✅ |

### 3.4 Preprod / Environment
| Area | Implementation | Status |
|------|----------------|--------|
| **Preprod guard** | `PreprodInternalGuard`: when `APP_ENV=preprod`, only allowlisted emails can access | ✅ |
| **Swagger** | Served only when `NODE_ENV !== 'production'` | ✅ |

### 3.5 Gaps / Recommendations
- **CSP:** Re-enable and tune for video/LiveKit if possible instead of fully disabling.
- **Secrets:** Ensure `ENCRYPTION_KEY`, JWT secrets, Razorpay keys, etc. are in env only, never committed.
- **Audit logging:** Consider logging sensitive actions (e.g. role changes, token adjustments) for compliance.

---

## 4. API Attack Mitigations

### 4.1 Rate Limiting (Throttling)
| Area | Implementation | Status |
|------|----------------|--------|
| **Global** | `@nestjs/throttler`: `ThrottlerModule` 120 req/60s default; `ThrottlerGuard` as `APP_GUARD` | ✅ |
| **Auth** | `@Throttle({ default: { ttl: 60, limit: 20 } })` on `AuthController` | ✅ |
| **Search** | `@Throttle({ default: { ttl: 60, limit: 60 } })` on `SearchController` | ✅ |
| **Messages** | 60 req/60s read; 20 req/60s write (`MessagesController`) | ✅ |

### 4.2 Input Validation
| Area | Implementation | Status |
|------|----------------|--------|
| **Global pipe** | `ValidationPipe`: `whitelist: true`, `transform: true`, `enableImplicitConversion` | ✅ |
| **DTOs** | `class-validator` used across 69+ DTOs (`IsString`, `IsEmail`, `MinLength`, etc.) | ✅ |
| **Query params** | Validation + transform on search, pagination, filters | ✅ |

### 4.3 Injection & Payload Risks
| Area | Implementation | Status |
|------|----------------|--------|
| **SQL** | Prisma parameterized queries; no raw SQL with user input | ✅ |
| **NoSQL / JSON** | Structured DTOs and validation limit arbitrary payloads | ✅ |
| **XSS** | React escaping; ensure no `dangerouslySetInnerHTML` on user content | ⚠️ Review |

### 4.4 Payment & Webhooks
| Area | Implementation | Status |
|------|----------------|--------|
| **Razorpay webhook** | Raw body preserved for signature verification | ✅ |
| **Signature check** | `x-razorpay-signature` vs HMAC using `RAZORPAY_WEBHOOK_SECRET`; reject if invalid | ✅ |
| **Verify flow** | Client `razorpay_signature` verified before crediting tokens | ✅ |

### 4.5 Gaps / Recommendations
- **DDoS / abuse:** Throttling is per-route; consider IP-based or per-user limits for auth/search.
- **CSRF:** Stateless JWT API; ensure no cookie-based session endpoints that need CSRF tokens.
- **Security headers:** Add `X-Content-Type-Options`, `Strict-Transport-Security` (if not via Helmet) where applicable.

---

## 5. Caching

### 5.1 Backend
| Area | Implementation | Status |
|------|----------------|--------|
| **In-memory** | `@Cacheable` decorator (`common/cache.decorator.ts`): `Map`-based, TTL, 5‑min cleanup | ✅ |
| **Usage** | `getFilterOptions` (5 min), `getTrending` (2 min) in `TutorsService` | ✅ |
| **Admin** | `AdminService` uses internal `getFromCache` / `setCache` for list/aggregations | ✅ |
| **Availability** | `Cache-Control: no-store, no-cache, must-revalidate, private` on slot endpoints | ✅ |

### 5.2 Frontend
| Area | Implementation | Status |
|------|----------------|--------|
| **Cache-busting** | Recurring-templates update: timestamp query param + `Cache-Control` headers on requests | ✅ |
| **Storage** | `localStorage` for search history, auth storage preference | ✅ |

### 5.3 HTTP & Compression
| Area | Implementation | Status |
|------|----------------|--------|
| **Compression** | `compression` middleware: GZIP, threshold 1 KB, level 6 | ✅ |
| **Cache-Control** | Explicit on availability; `Cache-Control` in CORS allowed headers | ✅ |

### 5.4 Gaps / Recommendations
- **Redis:** Replace in-memory cache with Redis for multi-instance deployment and shared cache.
- **CDN:** Use CDN + cacheable `Cache-Control` for static assets (Vercel handles this).
- **ETag / conditional requests:** Not used; consider for large, infrequently changing list endpoints.

---

## 6. Other Parameters

### 6.1 Observability
| Area | Implementation | Status |
|------|----------------|--------|
| **Sentry** | Optional `SENTRY_DSN`; captures unhandled rejections/exceptions; env + sampling | ✅ |
| **Logging** | Nest `Logger`; optional encrypt-interceptor and query logs in dev | ✅ |

### 6.2 Frontend Deployment (Vercel)
| Area | Implementation | Status |
|------|----------------|--------|
| **SPA fallback** | `vercel.json` rewrites `/((?!assets/|api/).*)` → `/index.html` | ✅ |
| **Assets** | `/assets/` excluded from rewrite so JS/CSS served with correct MIME | ✅ |
| **API proxy** | `/api/(.*)` rewrite; configurable `VITE_API_URL` for backend | ✅ |

### 6.3 Timeouts & Retries
| Area | Implementation | Status |
|------|----------------|--------|
| **HTTP client** | Frontend Axios `timeout: 15_000` ms | ✅ |
| **401 retry** | Single refresh attempt; then logout | ✅ |

### 6.4 WebSockets
| Area | Implementation | Status |
|------|----------------|--------|
| **Socket.IO** | Custom `CorsSocketIoAdapter` with origin allowlist; used for messaging etc. | ✅ |

---

## 7. Summary Matrix

| Category       | Score (1–5) | Notes                                                |
|----------------|-------------|------------------------------------------------------|
| **UX**         | 4           | Good loading, toasts, debounce, lazy load; add skeletons, offline/retry |
| **Scalability**| 4           | Solid DB indexing, pagination, code splitting; add Redis, document pooling |
| **Security**   | 4           | JWT, bcrypt, PII encryption, CORS, Helmet; tighten CSP, audit logging     |
| **API attacks**| 4           | Throttling, validation, webhook verification; consider IP/user limits     |
| **Caching**    | 3           | In-memory + compression; move to Redis for production scale               |
| **Observability** | 3        | Sentry + logs; add metrics (e.g. latency, error rate) and health checks   |

---

## 8. Recommended Next Steps

1. **Redis cache:** Introduce Redis for `@Cacheable` and admin cache; configure per env.
2. **Skeleton loaders:** Add skeletons for dashboard, bookings, and list UIs.
3. **CSP:** Re-enable Content-Security-Policy with exceptions for LiveKit/video.
4. **Rate limits:** Add stricter or IP-based limits for `/auth/login`, `/auth/register`, `/search/tutors`.
5. **Health checks:** Expand `/health` (or similar) for DB, cache, and critical deps.
6. **Security audit:** Review OWASP Top 10; run automated checks (e.g. `npm audit`, Snyk).

---

*This report reflects the codebase as of January 2026. Re-validate after significant changes.*
