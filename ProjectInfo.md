# RideSync — Project Reference (for resume-point generation)

> **How to use this file:** paste this whole document into Claude along with a specific job
> description. Ask it to generate tailored resume bullets. Everything here is factual and
> verified as of 2026-07-24; every number traces to a test run, the `load/` results, or a
> `DECISIONS.md` entry. Do not let the model invent metrics not present here.

---

## 1. One-line pitch

A deployed, horizontally-scalable MERN cab-aggregator platform (Uber/Ola-style): real-time ride
matching over WebSocket, geospatial nearest-driver assignment, dynamic surge fare estimation,
field-level AES-256-GCM PII encryption, a circuit-breaker/graceful-degradation layer, and full
observability (Prometheus + Grafana) — live on a public URL, load-tested with measured numbers.

**Live app:** https://ride-sync-cab-aggregator-platform-f.vercel.app
**Live API:** https://ridesync-cab-aggregator-platform.onrender.com (`/health`, `/api/*`, `/metrics`)
**Grafana (public):** https://scarletmeerkat3462.grafana.net/public-dashboards/7a50287abc8e4c8c930568ff8b455530
**Repo:** https://github.com/mahendra-kausik/RideSync-Cab_Aggregator_Platform

---

## 2. The problem this project demonstrates

A working MERN app that "runs on localhost" is a student project. The engineering story here is
turning it into a **production-shaped service**: (1) actually deployed at a public URL, (2)
**horizontally scalable** — sessions, rate limiting, and WebSocket fan-out moved out of one
process's RAM into Redis, (3) **measured** — real throughput/latency/concurrency numbers from load
tests, and (4) **observable** — Prometheus metrics, Grafana dashboards, and per-request correlation
IDs. Deliberately stays in the full-stack / production-engineering lane (no distributed-consensus or
AI depth).

---

## 3. Architecture

```
Rider / Driver / Admin browser
        │  HTTPS + WebSocket (Socket.IO)
        ▼
   Vercel  (React 18 + TS + Vite, static SPA)                 ← frontend
        │  VITE_API_BASE_URL / VITE_SOCKET_URL
        ▼
   Render  (Node 18 + Express + Socket.IO, native WS)         ← backend  (scalable architecture;
        │            │                         │                live deploy = 1 instance, free tier)
        │            │                         └─► Upstash Redis ── sessions (TTL / JWT blacklist)
        │            │                                           ── rate-limit counters
        │            │                                           ── Socket.IO adapter (cross-instance pub/sub)
        │            └─► GracefulDegradationService (circuit breakers: maps / sms / payment / geocoding)
        │                     └─ fallbacks: OSM tiles, console SMS, mock payment, city-coord geocoding
        ▼
   MongoDB Atlas M0  (users w/ 2dsphere geo index, rides, OTPs w/ TTL)

  Observability:  /metrics (prom-client) → Grafana Cloud → p50/p95/p99, RPS, error rate, breaker state
                  correlation ID per request (AsyncLocalStorage) → X-Request-ID response header
  Keep-warm:      cron-job.org → GET /health every ~10 min  (defeats free-tier sleep)
```

**Layered backend structure:** `models / middleware / services / controllers / routes / utils / config`.
**Frontend:** `contexts / services / components / hooks / pages / utils`, React Context for state.

---

## 4. Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Context, Axios, Socket.IO client,
  Leaflet + OpenStreetMap tiles (`react-leaflet`). *(No Mapbox — dep present but unused.)*
- **Backend:** Node.js 18, Express (CommonJS), Socket.IO, Mongoose, `ioredis`,
  `@socket.io/redis-adapter`, JWT + bcrypt, `prom-client`, Helmet, Joi.
- **Data:** MongoDB Atlas M0 (users w/ 2dsphere index, rides, OTPs w/ TTL index), Upstash Redis.
- **Infra / DevOps:** Render, Vercel, Grafana Cloud, cron-job.org, Docker Compose (local),
  GitHub Actions CI/CD, k6.
- **Testing:** Jest + Supertest + mongodb-memory-server (backend), Vitest (frontend).

---

## 5. Important mechanisms (with real parameters)

### 5.1 Geospatial nearest-driver matching — `services/MatchingService.js`
- Drivers stored with a GeoJSON `location` on a **MongoDB 2dsphere index**; queried with `$near` +
  `$maxDistance`.
- **Expanding-radius search:** 5 km → 10 km → 15 km. Stops at the first radius that yields available
  drivers; candidates capped (`MAX_DRIVERS_TO_CONSIDER`) and **sorted by distance** (Haversine,
  R = 6371 km) to pick the nearest.
- **Atomic assignment** to prevent driver double-booking under concurrency: the assign is a
  conditional atomic update, not read-then-write (this was a real race fixed during the audit — see
  §7).
- Complexity noted in code: O(k) space over drivers within radius.

### 5.2 Dynamic surge fare estimation — `services/FareService.js`
- Formula: `base + (perKm × distance) + (perMin × duration)`, then **surge applied multiplicatively**;
  clamped to a min/max fare; supports service-level multipliers (economy/…).
- Config (INR): base ₹50, ₹12/km, ₹2/min. Surge tiers: low ×1.0, medium ×1.5, high ×2.0, peak ×2.5.
- All monetary values rounded to 2 dp; validated inputs.

### 5.3 Real-time updates — Socket.IO
- Rider/driver ride events pushed over WebSocket. With the Redis adapter, an event emitted on one
  instance is delivered to a client connected to any instance (the scalability proof, §6).

### 5.4 Circuit breaker / graceful degradation — `services/GracefulDegradationService.js`
- Per-external-service circuit breakers with independent tuning:
  | Service | Failure threshold | Request timeout | Reset timeout |
  |---|---|---|---|
  | Maps | 3 | 5 s | 30 s |
  | SMS | 3 | 10 s | 60 s |
  | Payment | 2 | 15 s | 120 s |
  | Geocoding | 3 | 8 s | 45 s |
- States: **CLOSED → OPEN** (after N failures) → after reset timeout, next call is **HALF_OPEN**; a
  success closes it, a failure re-opens. Each OPEN breaker serves a **fallback**: OSM tiles for maps,
  console SMS, mock payment, city-coordinate geocoding — so the app degrades instead of failing.

### 5.5 Redis shared-state layer (the horizontal-scalability enabler) — Layer 2
- `sessionManager` (sessions + TTL + JWT blacklist), the rate limiter (`redisRateLimitStore.js`), and
  the Socket.IO adapter are all Redis-backed via one shared `ioredis` client.
- **In-memory fallback:** when `REDIS_URL` is unset the whole layer degrades to per-process memory, so
  local dev boots with zero external deps. Public interfaces preserved so callers didn't change.
- A first-party rate-limit store replaced `rate-limit-redis` after its internal retry loop defeated
  request timeouts (see §7 / P-006).

### 5.6 Auth & security
- **JWT + OTP** auth; session manager with token rotation; refresh tokens rejected as access tokens.
- **Login lockout** (`utils/loginLockout.js`): **Redis-backed, IP+account-scoped** — an attacker can't
  lock out a legitimate user, and can't dodge it via IP spoofing (`app.set('trust proxy', 1)` so
  Render's proxy exposes the real client IP).
- **PII encryption:** field-level **AES-256-GCM** on sensitive fields, verified encrypted-at-rest via
  the native Mongo driver.
- **Rate limiting** (per-route, Redis-backed): auth 20/5 min, OTP 3/5 min, API 100/15 min,
  ride-booking 5/min. Plus Helmet security headers (CSP/HSTS/etc.), Joi input validation, input
  sanitization.

### 5.7 Observability — Layer 4
- `prom-client` `/metrics` (Prometheus format): default process metrics + 3 custom —
  `http_request_duration_seconds` (histogram), `ride_match_duration_seconds` (histogram),
  `circuit_breaker_state` (gauge).
- **Correlation IDs** via `AsyncLocalStorage` (`utils/requestContext.js`): every log line in a request
  carries the same `requestId` automatically, echoed to the client as `X-Request-ID` — one request is
  traceable end-to-end across log lines.
- Grafana Cloud dashboard: p50/p95/p99 latency, request rate, 5xx error rate, circuit-breaker state.

---

## 6. Results / measured metrics

**All local against real Atlas M0 + Upstash Redis** (not the live Render deploy — see caveats).
Run config recorded in `load/README.md` (commit `20c6d38`, Node v24.4.1, k6, i5-1235U / 16 GB / Win 11).

| Scenario | Result |
|---|---|
| REST throughput (`GET /health`) | **100 req/s sustained, p95 = 3.72 ms, 0% errors** (7,725 requests) |
| Fare estimate (`POST /api/rides/estimate`) | p95 = 216.54 ms, 0% errors (rate-capped by design) |
| Concurrent WebSocket hold | **200 / 200 connections held stable over 20 s, 0 dropped** |
| Circuit-breaker trip | `maps` breaker **CLOSED → OPEN** captured (3 failures = threshold, <1 s) |
| Horizontal-scaling proof | ride update emitted on **instance A delivered to a client on instance B**; session survived an instance restart (2 local instances, 1 Upstash Redis) |

**Tests (re-verified 2026-07-24):** backend **173/173** passing (11 suites: unit/integration/system,
Jest+Supertest); frontend **59/59** passing (Vitest). CI runs both on every push/PR.

---

## 7. Engineering challenges solved (great for "tell me about a hard bug" / depth questions)

- **Silent PII-encryption no-op (P-007):** AES-256-GCM encryption was silently doing nothing on every
  save — the helper mutated Mongoose nested paths via plain bracket assignment, which Mongoose doesn't
  persist (only `.set()` does). Found it, fixed the one function, re-encrypted existing users, and
  **verified encrypted-at-rest with the native Mongo driver** (bypassing Mongoose's own decrypt hooks,
  which had masked the bug).
- **Production Redis incident (P-006):** live `/api/*` calls hung/failed. Root cause was a one-scheme
  env-var difference — Render's `REDIS_URL` used `redis://` (plaintext) instead of `rediss://` (TLS) —
  found by diffing local vs. Render config after `CLIENT LIST` diagnostics ruled out every code-level
  and Upstash-side cause. En route, fixed two *real* independent bugs: a stale long-lived connection
  (added keepAlive + retry pacing) and `rate-limit-redis`'s internal retry loop silently defeating
  request timeouts (replaced it with a first-party store + `withRedisTimeout` wrapper).
- **Concurrency bugs only reachable with 2+ instances / real races (full backend audit, D-008):**
  driver double-booking race, duplicate payment processing, duplicate ride-status transitions, a
  stale socket-disconnect wiping a live reconnection, `optionalAuth` fail-open bypassing the JWT
  blacklist, and a body-parser mounted *after* the sanitizer (so sanitization was a silent no-op on
  every POST body). All fixed with tests still green.
- **Dead security code masquerading as a feature (P-008):** brute-force protection referenced a
  `req.session` this JWT-only app never populated — it never ran. Replaced with the real Redis-backed
  IP+account lockout, then fixed a follow-on where Render's proxy made `req.ip` always `::1` (P-009).
- **Frontend correctness (D-009):** map centered on the wrong point globally (lng/lat passed to Leaflet
  un-flipped); silent token-rotation headers never read → forced logout after 12 h; a register spinner
  that never cleared. All fixed.

---

## 8. Honest caveats (state these; don't let a resume overclaim)

- Load tests are **local**, not against the live Render deploy (fault-injection endpoints only mount in
  dev; free-tier caps make live runs risky/unrepresentative).
- Horizontal scaling is proven with **two local instances**, not two Render instances — Render's free
  tier disallows scaling out. It's an architecture proof, not a live multi-instance deployment.
- Circuit-breaker state is **per-instance, in-memory** (no shared breaker across a fleet).
- `OPEN → HALF_OPEN` is a single-request transient — not reliably observable externally.
- Encryption key has **no rotation** (single `ENCRYPTION_KEY`, no envelope scheme).
- Payments are **mock/cash only** — no live gateway, no payment-webhook signature verification.
- Security audit logs write to local disk, wiped on Render cold start (not durable live).
- Backend statement coverage is ~32% for the curated 173-test suite (concentrated on core logic:
  auth, fare, matching, lockout; infra/logging files untested). Lead with test *counts*, not coverage.

---

## 9. Quantifiable claim bank (verbatim-safe; pick per JD)

- Deployed a full-stack real-time platform (React/Vercel + Node/Render + MongoDB Atlas + Upstash Redis)
  to a public URL with CI/CD auto-deploy on push.
- Made the WebSocket + session + rate-limit layer **horizontally scalable** via a Redis pub/sub adapter
  and shared stores; demonstrated cross-instance event delivery and session survival across restarts.
- Load-tested to **100 req/s at p95 = 3.72 ms (0% errors)** and **200 concurrent WebSocket connections**
  held with zero drops.
- Built a **circuit-breaker/graceful-degradation** layer over 4 external services with per-service
  thresholds and fallbacks; captured a live CLOSED→OPEN trip under fault injection.
- Instrumented **3 custom Prometheus metrics + default process metrics**, Grafana p50/p95/p99 dashboards,
  and **AsyncLocalStorage request correlation IDs** (`X-Request-ID`) for end-to-end tracing.
- Implemented **geospatial nearest-driver matching** (MongoDB 2dsphere `$near`, expanding 5→10→15 km
  radius, atomic conflict-free assignment) and **dynamic surge fare estimation**.
- Hardened auth: **AES-256-GCM PII encryption** (verified encrypted-at-rest), Redis-backed IP+account
  **login lockout**, JWT rotation, per-route rate limiting, Joi validation, Helmet headers.
- Diagnosed and fixed a **silent-encryption bug** and a **production TLS/Redis incident**, plus 8+ real
  concurrency/auth bugs found in a systematic audit; **173 backend + 59 frontend tests** passing in CI.
