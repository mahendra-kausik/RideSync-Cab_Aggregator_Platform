# RideSync — a deployed, horizontally-scalable cab-aggregator platform

A production-shaped MERN ride-hailing platform: real-time ride matching, geospatial
nearest-driver assignment, dynamic fare estimation, AES-256-GCM PII encryption, and a real
circuit-breaker/graceful-degradation layer — **deployed to a public URL, load-tested with
measured numbers, and instrumented with Prometheus + Grafana.**

### 🔗 Live

| | |
|---|---|
| **Live app (Vercel)** | https://ride-sync-cab-aggregator-platform-f.vercel.app |
| **Live API (Render)** | https://ridesync-cab-aggregator-platform.onrender.com — `/health`, `/api/*`, `/metrics` |
| **Grafana dashboard (public)** | https://scarletmeerkat3462.grafana.net/public-dashboards/7a50287abc8e4c8c930568ff8b455530 |

> The API is on Render's free tier and sleeps after ~15 min idle; a keep-warm ping mitigates
> this, but the first request after a long idle may cold-start (~30–50 s). Just retry.

### 🔑 Try it live

| Role | Phone | Password |
|---|---|---|
| Rider | `1234567890` | `demoRider123` |
| Driver | `1234567899` | `demoDriver123` |

Log in as the rider in one browser and the driver in another (incognito) to watch a ride
request cross between them over WebSocket in real time.

---

## Architecture (deployed state)

```
Rider / Driver / Admin browser
        │  HTTPS + WebSocket (Socket.IO)
        ▼
   Vercel  (React + TS + Vite, static build)                  ← frontend
        │  VITE_API_BASE_URL / VITE_SOCKET_URL
        ▼
   Render  (Node + Express + Socket.IO, native WS)            ← backend  (architecture is
        │                                                        horizontally scalable; the live
        │            │                         │                deploy runs 1 instance — Render's
        │            │                         │                free tier disallows scaling out)
        │            │                         └─► Upstash Redis ── sessions (TTL / blacklist)
        │            │                                           ── rate-limit counters
        │            │                                           ── Socket.IO adapter (cross-instance pub/sub)
        │            │
        │            └─► GracefulDegradationService (circuit breakers: maps / sms / payment / geocoding)
        │                     └─ fallbacks: OSM tiles, console SMS, mock payment, city-coord geocoding
        ▼
   MongoDB Atlas M0  (users w/ 2dsphere geo index, rides, OTPs w/ TTL)

  Observability:  /metrics (prom-client) ──► Grafana Cloud → p50/p95/p99 latency, RPS, error rate,
                  circuit-breaker state · correlation ID per request (X-Request-ID)
  Keep-warm:      cron-job.org ──► GET /health every ~10 min  (defeats free-tier sleep)
```

---

## What makes it production-shaped

### Deployed
Render (Node API + Socket.IO) + Vercel (React SPA) + MongoDB Atlas M0 + Upstash Redis, all on
free tiers, no credit card. Deploys on `git push` to `main` via a GitHub Actions → Render deploy
hook; a cron-job.org ping to `/health` keeps the free instance warm.

### Horizontally scalable
Sessions, rate-limit counters, and Socket.IO fan-out are all backed by Redis (`ioredis` +
`@socket.io/redis-adapter` + a first-party rate-limit store), so a WebSocket event emitted on one
instance reaches a client connected to another. When `REDIS_URL` is unset the whole layer falls
back to in-memory, so local dev boots with zero external dependencies.

**Precise claim:** horizontal scalability is proven by running **two local backend instances**
against one Upstash Redis and observing a ride update cross between them, plus a session surviving
an instance restart. The **live Render deploy runs a single instance** — the free tier disallows
scaling out — so this is an architecture proof, not a live multi-instance deployment.

### Load-tested with real numbers
Three k6 / Node scenarios in [`load/`](load/README.md), run against the backend on real Atlas +
Upstash. Run config (commit, host, date) is recorded in `load/README.md`.

| Scenario | Result |
|---|---|
| REST throughput (`GET /health`) | 100 req/s sustained, **p95 = 3.72 ms**, 0% errors (7,725 reqs) |
| Fare estimate (`POST /api/rides/estimate`) | p95 = 216.54 ms, 0% errors (rate-capped by design — see `load/README.md`) |
| Concurrent WebSocket hold | **200/200** connections held stable over 20 s, 0 dropped |
| Circuit-breaker trip | `maps` breaker **CLOSED → OPEN** captured (3 failures, threshold 3, <1 s) |

### Observable
`prom-client` exposes `/metrics` in Prometheus format: default process metrics plus three custom
metrics — `http_request_duration_seconds` (histogram), `ride_match_duration_seconds` (histogram),
and `circuit_breaker_state` (gauge). Grafana Cloud renders p50/p95/p99 latency, request rate, 5xx
error rate, and circuit-breaker state (public link above). Every request carries a correlation ID
threaded through the logger via `AsyncLocalStorage` and echoed back as an `X-Request-ID` header,
so a single request is traceable across all its log lines.

### Hardened
- **Login lockout:** real Redis-backed IP+account-scoped lockout (`utils/loginLockout.js`) — an
  attacker can't lock out a legitimate user, and it can't be bypassed via a spoofed IP (`trust
  proxy` set for Render).
- **PII encryption:** AES-256-GCM field-level encryption on sensitive fields, verified
  encrypted-at-rest via the native Mongo driver.
- **Validation:** Joi schemas with password complexity + field-format rules on login/signup.
- **Rate limiting:** per-route limiters — auth 20/5 min, OTP 3/5 min, API 100/15 min, ride-booking
  5/min — Redis-backed so they survive a restart.

---

## Getting started (local)

### Docker (recommended)
```bash
git clone https://github.com/mahendra-kausik/RideSync-Cab_Aggregator_Platform.git
cd RideSync-Cab_Aggregator_Platform
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
# set JWT_SECRET (openssl rand -base64 32) and ENCRYPTION_KEY (32 bytes)
docker-compose up --build
```
- Frontend: http://localhost:3000 · Backend API: http://localhost:5000/api · Mongo: 27017 · Redis: 6379

Demo rider/driver accounts are seeded automatically on backend boot (dev only).

### Without Docker
```bash
cd backend  && npm install && npm run dev     # API on :5000
cd frontend && npm install && npm run dev     # SPA on :3000 (or Vite's default)
```
`REDIS_URL` is optional locally — unset it and the session / rate-limit / socket layer falls back
to in-memory.

---

## Testing

- **Backend:** 173/173 tests passing (Jest + Supertest, 11 suites — unit / integration / system).
- **Frontend:** 59/59 tests passing (Vitest).

```bash
cd backend  && npm test        # 173 tests
cd frontend && npm test        # 59 tests
```

CI runs both suites on every push and PR to `main` (GitHub Actions).

---

## Technology stack

**Backend:** Node.js 18+ · Express · MongoDB Atlas + Mongoose · Socket.IO · `ioredis` +
`@socket.io/redis-adapter` · JWT + bcrypt · `prom-client` · Helmet · Jest.

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · React Context · Axios · Socket.IO
client · **Leaflet + OpenStreetMap tiles** (`react-leaflet`) for maps.

**Infra / DevOps:** Render · Vercel · MongoDB Atlas M0 · Upstash Redis · Grafana Cloud ·
cron-job.org · Docker Compose · GitHub Actions · k6.

---

## Honest caveats

This is a portfolio project deployed on free tiers; these are the known limits, stated up front:

- **Load tests are local, not against live Render.** Fault-injection endpoints only mount in
  `NODE_ENV=development`, and free-tier caps (Upstash 500K commands/mo, Atlas 10 GB/7-day, Render's
  throttled shared CPU) make sustained runs against the live deploy both risky and unrepresentative.
  The numbers above are from real Atlas + Upstash, single machine — see `load/README.md` for the
  exact config.
- **Horizontal scaling is proven locally, not live.** Two local instances, not two Render instances
  (free-tier restriction). See the scalability note above.
- **Circuit-breaker state is per-instance, in-memory.** With multiple instances each keeps its own
  breaker state; there's no shared breaker across the fleet.
- **`OPEN → HALF_OPEN` is a single-request transient** and not reliably observable externally — the
  load test reports what it actually saw rather than asserting a guaranteed catch.
- **Encryption key has no rotation.** A single `ENCRYPTION_KEY` encrypts all PII; there's no
  key-rotation or envelope-encryption scheme.
- **Payments are mock/cash only** — no live gateway, and no payment-webhook signature verification.
- **Security audit logs write to local disk**, which Render wipes on cold start, so they're not
  durable in the live deploy.
