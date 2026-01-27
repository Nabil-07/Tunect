# Content Security Policy (CSP) — Directives & Testing

CSP is **enabled** in Helmet (`main.ts`). It is **not** disabled. The policy is built from `src/common/csp.config.ts` and is **environment-aware** (dev vs production).

---

## 1. Directive overview

| Directive | Purpose | Allowed sources |
|-----------|---------|-----------------|
| **default-src** | Fallback for directives that don’t have an explicit source list. | `'self'` |
| **script-src** | Scripts that can run (including inline, when allowed). | `'self'`, Razorpay checkout, Vercel, Tunect frontends; **dev only**: `'unsafe-inline'` (Swagger). |
| **style-src** | Stylesheets and inline styles. | `'self'`, Vercel, Tunect frontends; **dev only**: `'unsafe-inline'` (Swagger). |
| **img-src** | Images. | `'self'`, `data:`, `blob:`, Vercel, Tunect frontends. |
| **connect-src** | Fetch, XHR, WebSocket, EventSource. | `'self'`, API (`APP_URL`), frontend (`FRONTEND_URL`), `tunectnow.com`, `*.preprod.tunectnow.com`, Razorpay, LiveKit, Vercel; **dev**: localhost. |
| **frame-src** | iframes. | `'self'`, `https://checkout.razorpay.com` (Razorpay checkout). |
| **media-src** | Video/audio. | `'self'`, `blob:` (LiveKit / video streams). |
| **font-src** | Web fonts. | `'self'`, Vercel, Tunect frontends. |
| **worker-src** | Web Workers, Service Workers. | `'self'`, `blob:` (LiveKit workers). |
| **object-src** | `<object>`, `<embed>`, `<applet>`. | `'none'` (blocked). |
| **base-uri** | Base URL for relative URLs. | `'self'`. |
| **form-action** | Form submit targets. | `'self'`. |

---

## 2. Environment-aware behaviour

- **Production** (`NODE_ENV === 'production'`):
  - No `'unsafe-inline'` for `script-src` or `style-src`.
  - Stricter policy; Swagger is not served.

- **Development**:
  - `'unsafe-inline'` allowed for `script-src` and `style-src` so Swagger UI at `/docs` works.
  - Localhost origins (3000, 5173) added to `connect-src`.

LiveKit origins are derived from `LIVEKIT_HOST` (e.g. `wss://livekit-preprod.tunectnow.com` → `wss://…` and `https://…`). API and frontend come from `APP_URL` and `FRONTEND_URL`. “Tunect frontends” = `https://tunectnow.com`, `https://*.preprod.tunectnow.com`.

---

## 3. Testing steps (CSP does not break frontend)

### 3.1 Prerequisites

- Backend running (e.g. `npm run start:dev`).
- Frontend running (e.g. Vite on 5173).
- `APP_URL`, `FRONTEND_URL`, `LIVEKIT_HOST` set correctly for your environment.

### 3.2 API responses (including Swagger)

1. **Swagger UI (dev only)**  
   - Open `http://localhost:3000/docs` (or your API base + `/docs`).  
   - Confirm Swagger loads, no CSP errors in the console.  
   - Try “Authorize” and a few GET/POST requests.

2. **JSON API**  
   - Call e.g. `GET /health` or `GET /auth/…` from browser or Postman.  
   - Confirm 200 and no CSP-related issues (CSP on API JSON is ignored by the browser for fetch/XHR; it matters only for document loads like `/docs`).

### 3.3 Frontend (SPA) — video & payment

**Note:** CSP in `main.ts` is sent **by the API**. The SPA document is usually served by **Vercel** (or the Vite dev server). The **browser applies CSP from the document origin**. So:

- **If the SPA is served from the API** (e.g. same host, API serves `index.html`):  
  The Helmet CSP **does** apply to the SPA. Use the tests below on that setup.

- **If the SPA is served from Vercel/Vite** (different origin):  
  The **frontend** must set its own CSP (e.g. Vercel headers or `index.html` meta). Our config is a **reference** for what the frontend CSP should allow (Razorpay, LiveKit, `blob:`, etc.).

3. **Login & navigation**  
   - Log in, open a few main routes (dashboard, bookings, find tutors, etc.).  
   - Confirm no CSP errors in DevTools → Console.  
   - Check Network tab: API calls return 2xx.

4. **Razorpay (payment)**  
   - Go through a flow that opens Razorpay Checkout (e.g. buy tokens, checkout).  
   - Confirm the Checkout modal/iframe loads (script from `checkout.razorpay.com`, frame from `checkout.razorpay.com`).  
   - Complete or cancel payment; no CSP errors.

5. **LiveKit (video)**  
   - Join a session that uses LiveKit (e.g. from tutor/student sessions → “Join” / class page).  
   - Confirm:
     - WebSocket connection to `LIVEKIT_HOST` (wss) works.  
     - Video/audio uses `blob:` or allowed `media-src` sources.  
   - Check Console for CSP violations.  
   - Verify you can see/hear participants and use mute/video toggles.

6. **Vercel / assets**  
   - If you use `*.vercel.app` for assets, load the app from a Vercel deployment.  
   - Confirm JS/CSS/fonts load without CSP errors.

### 3.4 Quick CSP violation check

1. Open DevTools → Console.  
2. Use the app (login, browse, payment, LiveKit).  
3. Look for messages like:  
   `"Refused to load ... because it violates the following Content Security Policy directive: ..."`  
4. If you see any, note the **directive** and **blocked URL**; add that source to the matching directive in `csp.config.ts` (or frontend CSP) if it’s legitimate.

### 3.5 Verify CSP header

```bash
curl -sI "http://localhost:3000/docs" | grep -i content-security-policy
```

You should see a `Content-Security-Policy` header (not `Content-Security-Policy-Report-Only` unless you enable report-only mode).

---

## 4. Summary

- CSP is **enabled**; it is **not** disabled.  
- Razorpay (checkout + API), LiveKit (wss + https), Vercel assets, and API/frontend origins are allowed.  
- WebSockets (LiveKit) and `blob:` (video) are allowed.  
- `'unsafe-inline'` is **avoided in production**; used only in dev for Swagger.  
- Config is **environment-aware** via `NODE_ENV` and `APP_URL` / `FRONTEND_URL` / `LIVEKIT_HOST`.  

If video or payment breaks, check the Console for CSP violations and extend the relevant directive in `csp.config.ts` (or in the frontend CSP) for the blocked URL.
