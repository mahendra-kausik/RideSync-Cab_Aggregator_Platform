# PROJECT_PLAN.md — RideSync

> **What** we are upgrading and in **what order**. Read alongside `CLAUDE.md` (how to build) and
> `DECISIONS.md` (why each choice). All facts marked ⚠️ **VERIFY** must be re-checked against the
> provider's live docs before you rely on them — free-tier limits change frequently.

---

## 0. Problem statement (the thing to say in interviews)

RideSync is a working MERN ride-hailing platform — riders book, a geospatial matcher assigns the nearest
available driver, both sides get live updates over WebSocket, fares are computed dynamically, and PII is
encrypted at rest. It already has real engineering: a circuit-breaker/graceful-degradation layer, JWT/OTP
auth, field-level AES-256-GCM encryption, and 578 automated tests at ~72% coverage.

**But it has never left localhost.** It runs only via Docker Compose, so three things that separate a
production service from a student project are missing or unproven:
1. **It isn't deployed** — no public URL, so "real-time ride-hailing platform" is a claim nobody can click.
2. **It can't scale horizontally** — sessions, rate limiting, and Socket.IO all live in one process's RAM,
   so running a second instance behind a load balancer would break them. Redis is provisioned in
   `docker-compose.yml` but **no app code uses it.**
3. **Nothing is measured** — the circuit breaker and geospatial matcher have no throughput/latency numbers,
   so there are no defensible metrics for a resume.

This plan closes those three gaps. It is an **upgrade, not a rewrite**, and it deliberately stays in the
full-stack / production-engineering lane (deployment, scalability, load testing, observability, DB/API
hardening) — **no** distributed-consensus or AI additions, which are covered by sibling projects.

---

## 1. Locked decisions (see DECISIONS.md D-001..D-003)

- **Hosting (D-001):** **Render** (Node API + Socket.IO, native WebSocket) + **Vercel** (React frontend)
  + **MongoDB Atlas M0** (managed Mongo) + **Upstash Redis** (serverless). Free, no credit card, and Render
  is already the target of the existing CI/CD deploy hook.
- **Shared state (D-002):** move sessions, rate limiting, and Socket.IO fan-out to **Redis**, with an
  in-memory fallback when `REDIS_URL` is unset (local dev stays zero-dependency).
- **Socket scaling (D-003):** `@socket.io/redis-adapter` (pub/sub) over sticky-session load balancing —
  lets any instance deliver to any connected client without LB affinity.

---

## 2. Architecture (target state)

```
Rider / Driver / Admin browser
        │  HTTPS + WebSocket (Socket.IO)
        ▼
   Vercel  (React + TS + Vite, static build, free)          ← frontend
        │  VITE_API_URL / VITE_SOCKET_URL
        ▼
   Render  (Node + Express + Socket.IO, always-on, native WS) ← backend  (architecture is scalable;
        │                                                          live deploy is 1 instance — Render
        │                                                          free tier disallows scaling out)
        │            │                         │
        │            │                         └─► Upstash Redis  ── sessions (TTL/blacklist)
        │            │                                            ── rate-limit counters (rate-limit-redis)
        │            │                                            ── Socket.IO adapter (cross-instance pub/sub)
        │            │
        │            └─► GracefulDegradationService (circuit breakers: maps / sms / payment / geocoding)
        │                     └─ fallbacks: OSM tiles, console SMS, mock payment, city-coord geocoding
        ▼
   MongoDB Atlas M0  (users w/ 2dsphere geo index, rides, OTPs w/ TTL)

  Observability (Layer 4):
     • /metrics (prom-client)  ──►  Grafana Cloud (free)  →  p50/p95/p99 latency, error rate, RPS
     • correlation-ID per request threaded through the existing logger

  Keep-warm:  cron-job.org  ──►  GET /health  every ~10 min  (defeats Render free-tier sleep)
```

**Request/scale story (the core interview differentiator):** before this upgrade, a WebSocket message
emitted on instance A never reaches a client on instance B, and rate limits/sessions diverge per instance —
so the app is single-instance-only. After Layer 2, Redis pub/sub + shared session/limit stores make the app
**horizontally scalable**, demonstrable by running two instances locally and watching a ride update cross
between them.

---

## 3. Tech stack (upgrade deltas; ⚠️ re-verify free-tier limits live)

### Hosting — **Render Web Service (backend)**
- Always-on Node process, **native WebSocket** (no config), deploy-on-git-push, health check at `/health`.
- **⚠️ VERIFY / known tradeoff:** free instances **sleep after ~15 min idle → ~30–50 s cold start.**
  Mitigation: a free cron-job.org ping to `/health` every ~10 min. One always-on service ≈ 720 hrs/month
  < the ~750 free instance-hours. No credit card required.
- **Gotcha:** `server.js` runs a `SecurityValidator` gate in production that refuses to boot on missing/weak
  secrets — all required env vars must be set before first deploy.

### Frontend — **Vercel (Hobby, free)**
- Static Vite build (`npm run build` → `dist/`). Env: `VITE_API_URL`, `VITE_SOCKET_URL` → Render URL.
- **⚠️** Hobby is non-commercial — fine for a portfolio.

### Database — **MongoDB Atlas M0 (free)**
- **⚠️ VERIFY:** 512 MB shared cluster, no card. IP allowlist `0.0.0.0/0` (Render free tier has no static egress IP).
- Existing indexes live in `scripts/mongo-init.js` (only runs for the local Docker container) — port them to a
  one-shot `scripts/ensure-indexes.js` run against Atlas so the `2dsphere` + TTL + hot-query indexes exist in prod.

### Shared state — **Upstash Redis (serverless, free)**
- **⚠️ VERIFY** free command/day cap. Speaks the Redis wire protocol → works with `ioredis`,
  `@socket.io/redis-adapter`, and `rate-limit-redis`.
- Local dev keeps using the Docker `redis:7-alpine` already in `docker-compose.yml`.

### Load testing — **k6 (open-source, local runner, free)**
- Scenarios in `load/`: REST ramp (auth → fare estimate → book), concurrent WebSocket hold, and a
  failure-injection run that trips the circuit breaker under load.

### Observability — **prom-client + Grafana Cloud (free)**
- `prom-client` exposes `/metrics`; Grafana Cloud (⚠️ VERIFY free scrape/retention) renders dashboards.
  Fallback if Grafana stalls: `/metrics` + a local Prometheus/Grafana `docker-compose` profile.

---

## 4. Build Layers (build ONE at a time — see CLAUDE.md Prime Directive)

Each layer has an **Acceptance Gate**. Do not proceed until its gate passes and I approve.
Order is leverage-first: get it deployed and demoable, then add the depth that produces metrics.

### Layer 0 — Retarget the operating docs ✅ (this layer)
- Rewrite `CLAUDE.md`, `PROJECT_PLAN.md`, `PROGRESS.md`, `DECISIONS.md` from the previous project to RideSync,
  keeping the working-protocol instructions intact.
- **Gate:** all four docs describe RideSync only; no DocsGPT/LangChain/RAGAS/Python references remain.

### Layer 1 — Deploy to a public URL (foundation)
- ✅ **Pre-deploy bug fix (done)** — `frontend/src/components/common/MapComponent.tsx` had malformed Mapbox-token
  logic (`isValidMapboxToken` assigned `mapboxToken && useEffect(...)`, a React hook in a `&&` short-circuit,
  always falsy; `mapboxToken.startsWith('pk.')` threw when `VITE_MAPBOX_ACCESS_TOKEN` was unset — exactly Vercel's
  default, i.e. it would have crashed the map on first deploy). Fixed: deleted the broken branch, now OSM tiles
  only (matches the free-tier reality); verified via `npm run build`.
- Atlas M0 cluster + `scripts/ensure-indexes.js`. Render Web Service for the backend (real secrets, `/health`
  check). Vercel for the frontend (`VITE_*` → Render). CORS + Socket.IO CORS allow the Vercel origin.
  cron-job.org keep-warm ping. Replace the placeholder `deploy` job in `.github/workflows/ci-cd.yml` with the
  real Render deploy hook.
- **Gate:** live Vercel URL loads; register → login → book → driver-accept works end-to-end against the deployed
  backend, including a live WebSocket ride update.

### Layer 2 — Redis shared-state layer (highest-leverage depth)
- Add `ioredis`, `@socket.io/redis-adapter`, `rate-limit-redis`. Back `sessionManager` with Redis (preserve its
  public interface). Swap rate-limit store to `rate-limit-redis`. Attach the Redis adapter to Socket.IO. Keep an
  in-memory fallback when `REDIS_URL` is unset.
- ⚠️ **Render's free tier explicitly disallows scaling beyond a single instance** (confirmed from Render's
  docs, §8) — the horizontal-scaling proof below runs as **two local processes** against the same (Upstash)
  Redis, not as two live Render instances. This is still a fully valid proof that the architecture is
  horizontally scalable; be precise about the local-vs-live distinction in the README and in interviews.
- **Gate:** two **local** backend instances against one Redis — a ride update emitted via instance A reaches
  a client on instance B; sessions survive a single-instance restart; all 578 backend tests still pass.

### Layer 3 — Load testing with k6 (real metrics)
- `load/` scenarios against the **deployed** stack: REST ramp (req/s + p95), concurrent WS hold, and a
  failure-injection run showing the circuit breaker trip (CLOSED→OPEN→HALF_OPEN).
- **Gate:** committed `load/README.md` with a results table — sustained X req/s, p95 < Y ms, Z concurrent WS
  connections, plus a captured circuit-breaker trip. These become the resume metrics.

### Layer 4 — Observability
- `prom-client` `/metrics` (default + HTTP request-duration histogram, ride-match-duration, circuit-breaker
  state gauge). Ship to Grafana Cloud for p50/p95/p99 + error-rate dashboards. Thread a correlation ID per
  request through `requestLogger.js` + `logger.js`.
- **Gate:** `/metrics` returns Prometheus format; a dashboard shows p50/p95/p99 + error rate under a k6 run; a
  single request is traceable by correlation ID across log lines.

### Layer 5 — README-as-paper & defense (last)
- Update `README.md`: architecture diagram, live URLs, load-test tables, the horizontal-scaling story, and the
  honest-caveats section (circuit-breaker probe points, key-management gap). Resume bullets backed by results files.
- **Gate:** every number in the README traces to a `load/` results file or a `DECISIONS.md` entry.

---

## 5. Roadmap (leverage-first; part-time placement-season window)

| Phase | Layers | Outcome |
|---|---|---|
| A | 0, **1** | Docs retargeted; **live public URL** with the full booking flow working. |
| B | **2** | Redis shared state → **horizontal scalability** demonstrable across two local instances (Render's free tier itself stays single-instance). |
| C | 3 | k6 load tests → **real throughput/latency numbers** + circuit-breaker trip captured. |
| D | 4 | Prometheus + Grafana dashboards + correlation IDs → production-grade observability. |
| E | 5 | README-as-paper, resume bullets, demo. |

**Minimum viable upgrade path (if time runs out):** Layer 1 (deploy, including the MapComponent fix) + Layer 3
(load test) — a live URL with real measured numbers and no lingering pre-deploy crash risk. Redis (Layer 2) is
the first thing to add with a spare weekend; it's the single highest-leverage upgrade.

---

## 6. Roadmap / hardening backlog (built if time allows; quick wins folded into Layers 1–2)

- ✅ **Done — dead-code cleanup (was NOT a live bug):** `backend/controllers/rideController.js` had an unused
  static `calculateFare` using **USD** pricing, never called anywhere (grep-verified — all real paths already
  used `backend/services/FareService.js`'s **INR** pricing). Fares were correct at runtime; the duplicate was
  only a trap for a reviewer skimming the code. Deleted; verified via `services-fare.test.js` +
  `rides-api.test.js` (51/51 passing).
- **Quick win — index audit:** `explain()` the hot queries (geospatial `$near`, rides by `status`/`driverId`);
  add compound indexes where a collection scan appears; fold into `ensure-indexes.js`.
- **Later — OpenAPI/Swagger:** generate an OpenAPI 3.0 spec + `swagger-ui-express` at `/api/docs` (you already
  have a Postman collection; a live spec is more professional).
- **Later — idempotency keys on ride booking:** prevent double-book/double-charge on a client retry (exactly-once
  booking) — genuine correctness depth without being a distributed-systems project.

---

## 7. Metrics to track and put on the resume (fill X/Y with YOUR measured numbers — never invent)

**Deployment / scale:**
- "Deployed a full-stack real-time platform (React/Vercel + Node/Render + MongoDB Atlas + Redis) at a public URL."
- "Made the WebSocket + session + rate-limit layer **horizontally scalable** via a Redis adapter/shared store;
  demonstrated cross-instance delivery across N instances."

**Load / performance (from k6 against the deployed stack):**
- "Load-tested to **X req/s at p95 < Y ms**; sustained **Z concurrent WebSocket connections**."
- "Validated the graceful-degradation layer by inducing failures under load and observing the circuit breaker
  trip (CLOSED→OPEN→HALF_OPEN) with fallback continuity."

**Observability:**
- "Instrumented **N Prometheus metrics** + Grafana dashboards (p50/p95/p99 latency, error rate) and request
  correlation IDs for end-to-end tracing."

**Data / correctness (if hardening built):**
- "Cut hot-query latency **X→Y ms** via compound indexing verified with `explain()`; idempotent booking (exactly-once)."

**Honesty guardrails:** report *your* measured numbers with the config recorded in the results file; acknowledge
the known caveats (circuit breaker is per-instance in-memory; encryption key has no rotation) rather than hiding them.

---

## 8. Free-tier limits — verified 2026-07-22 against live docs/pricing pages

- ✅ **Render:** 750 free instance-hrs/month · 15-min idle → spin-down · ~1 min cold-start · filesystem
  wiped on spin-down. **⚠️ Confirmed hard restriction: free web services cannot scale beyond a single
  instance** (Render's own docs). This means Layer 2's horizontal-scaling proof runs on **two local
  processes**, not on the live deployed URL — see Layer 2's gate and the interview-defense notes.
- ✅ **MongoDB Atlas M0:** 512 MB storage · 10 GB in/out per rolling 7-day window · 1 free cluster/project.
  ⚠️ Still open: exact ops/sec throughput cap and max concurrent connections — not found on the page
  checked; confirm before Layer 2 spins up a second instance sharing the same cluster.
- ✅ **Upstash Redis:** 256 MB data · 10 GB bandwidth/month · **500K commands/month** · 1 free database.
  ⚠️ Still open: TCP/`ioredis` wire-protocol access on the free plan wasn't independently confirmed
  (vs. REST-only) — check before Layer 2, since `ioredis` + `@socket.io/redis-adapter` need real TCP.
- ✅ **Grafana Cloud:** 14-day retention · 10K active series/month (metrics product, which is all this
  project needs). ⚠️ Still open: logs/traces GB caps, team-size limit — not shown on the pricing page
  checked; not blocking for Layer 4.
- ✅ **Vercel Hobby:** 100 GB bandwidth/month · 1M function invocations · 10s/60s function duration ·
  non-commercial ToS restriction (fine for a portfolio). Function limits are moot here — this is a static
  SPA deploy, no serverless functions used.
- ⚠️ **cron-job.org:** exact interval/timeout/response-size/API-request caps not published on their
  marketing page — confirm at signup. Any interval under Render's 15-min sleep window still satisfies
  the keep-warm requirement.
