# PROGRESS.md — Running State

> **Read first at session start; update at the end of every layer. Keep it short.**
> This is the resume doc — the *what shipped* index. Full rationale for every choice
> lives in `DECISIONS.md`; headline numbers + architecture live in `README.md`.

## Current status
**✅ P-006 — RESOLVED and verified live** (see DECISIONS.md's seven P-006 entries for the full incident).
Root cause of the live failures: Render's `REDIS_URL` env var used `redis://` (plaintext) instead of
`rediss://` (TLS) — a one-scheme env var difference, not an application bug. Found by diffing the working
local `.env` against Render's dashboard value after `CLIENT LIST` diagnostics had ruled out every
application- and Upstash-side explanation. User corrected it in Render's dashboard; live-verified after
redeploy: clean boot with zero `ECONNRESET` (vs. continuous churn on every prior deploy log this session),
`GET /api` 200 in 306ms, `POST /api/auth/login-phone` 200 in 2.8s with a real demo-account login.
The five application-level fixes made en route stay in place (not reverted) — they fix a real, independent,
still-possible bug (a long-lived connection going stale after hours of idle time, which the `rediss://` fix
does nothing to prevent) and a real library defect (`rate-limit-redis`'s retry loop silently defeating any
timeout). Current stack: `backend/utils/withRedisTimeout.js`, `backend/utils/redisRateLimitStore.js`,
`backend/config/redis.js` (retryStrategy + keepAlive).

**Layer 1 shipped — app is live on a public URL.** Demo-account login 401 (P-002) is now **resolved** — all
three demo accounts (admin/rider/driver) were seeded directly against the live Atlas database this session
via `npm run seed` with `MONGO_URI` pointed at Atlas. Note: `backend/scripts/seed.js` has the demo passwords
hardcoded and is tracked in git (public repo) — so those credentials are effectively public regardless of
whether they're printed in the README; publish rider/driver in the README as "try it live," keep admin's
password out of the README for convenience/griefing-reduction only, not as real secrecy (see P-006 session
for context on why the live API needs to actually work before any of this matters for a demo).

**Layer 2 shipped — gate passed.** `sessionManager`, the rate limiter, and Socket.IO are all Redis-backed
(Upstash) with in-memory fallback preserved (D-010). The two-local-instance acceptance gate ran against real
Upstash Redis + Atlas Mongo and passed both checks (cross-instance Socket.IO delivery, session survives an
instance restart) — see the "Layer 2 gate — PASSED" entry in `DECISIONS.md`. Along the way it caught and
fixed two real concurrency bugs only reachable with 2+ instances: a demo-seed race (P-004) and a
rate-limiter Redis-key collision (D-011). Lint 0/0, tests 164/164 (163 existing + 1 new) at the time — see the post-Layer-4
hardening note below for the current 173/173 baseline.

**Layer 3 shipped — gate passed.** Three `load/` scenarios (k6 REST ramp, Node/`socket.io-client` WS hold,
Node fault-injection breaker trip), all local against real Atlas + Upstash, zero backend runtime code
changes. Results: `/health` sustained 100 req/s at p95=3.72ms (0% errors); 200/200 concurrent WebSocket
connections held stable for 20s; circuit breaker CLOSED→OPEN captured cleanly (OPEN→HALF_OPEN not externally
observable — documented limitation, see D-013). Along the way, discovered a rate-limit gate the earlier
research pass missed — see D-012.

**Layer 4 shipped — code + local gate passed; Grafana Cloud dashboard wiring left as a manual follow-up.**
`prom-client` `/metrics` (default process metrics + `http_request_duration_seconds` +
`ride_match_duration_seconds` + `circuit_breaker_state` gauge). Correlation IDs threaded through
`logger.js` via `AsyncLocalStorage` (`backend/utils/requestContext.js`) — every log line in a request now
carries the same `requestId` automatically, and it's echoed back as an `X-Request-ID` response header. See
D-014. Lint 0/0, tests 164/164, no regressions at the time — see the post-Layer-4 hardening note below for
the current 173/173 baseline.
- **Baseline being upgraded:** working MERN cab-aggregator, 578 backend tests (~72% coverage), real-time
  Socket.IO, geospatial matching, AES-256-GCM PII encryption, circuit-breaker graceful degradation.

## Layer checklist
- [x] **Layer 0 — Retarget operating docs** (CLAUDE.md, PROJECT_PLAN.md, PROGRESS.md, DECISIONS.md rewritten
      from the previous DocsGPT project to RideSync; working-protocol instructions preserved).
- [x] **Layer 1 — Deploy to a public URL**
      - [x] Fixed `MapComponent.tsx` pre-deploy crash risk (broken Mapbox-token logic → OSM-only); verified via `npm run build`.
      - [x] Deleted dead/unused `calculateFare` duplicate in `rideController.js` (was never called — not a live bug); verified via `services-fare.test.js` + `rides-api.test.js` (51/51 pass).
      - [x] `backend/scripts/ensure-indexes.js` written (syncs indexes already declared in `User`/`Ride`/`OTP`
            schemas); `autoIndex: false` in production (`backend/config/database.js`) so it doesn't happen
            implicitly on connect. See D-004. Full suite run: 161/163 passing — the 2 failures are pre-existing
            in `services-matching.test.js` (confirmed via `git stash`, unrelated to this change, not fixed here).
      - [x] CORS + Socket.IO CORS already parametrized via `FRONTEND_URL` (`backend/middleware/security.js`,
            `backend/server.js`) — will pick up the Vercel origin automatically once that env var is set on Render.
      - [x] Render deploy hook already wired in `.github/workflows/ci-cd.yml` (`curl ${{ secrets.RENDER_DEPLOY_HOOK }}`) — just needs the real secret value once the Render service exists.
      - [x] Fixed CI/CD `build` job (was failing on every run): pinned `typescript` via root-level npm
            `overrides` (was floating to 7.0.2, incompatible with `@typescript-eslint@6.x`); relaxed both
            `frontend/` and `backend/.eslintrc.json` rules that never matched the codebase's actual
            (inconsistent) style; cleaned up real mechanical lint violations on both sides; fixed the 2
            pre-existing `services-matching.test.js` failures (a real test/`DISABLE_MATCHING`-flag interaction
            bug, not just pre-existing noise); fixed `ci-cd.yml` exporting `MONGODB_URI` (app expects
            `MONGO_URI` everywhere) and `setup.js` ignoring the CI-provided `mongo` service container in favor
            of always spinning up `mongodb-memory-server` (binary-download flakiness on fresh CI VMs). See
            P-001. Verified both DB-connection branches locally; awaiting a live CI run to confirm end-to-end
            (last checked run was still red on the pre-fix `mongodb-memory-server` path).
      - [x] Hosted accounts created: MongoDB Atlas M0 (AWS, N. Virginia), Upstash Redis (Virginia, eviction on),
            Render Web Service (Virginia), Vercel (frontend). All env vars wired (see D-005 for region choices).
      - [x] `RENDER_DEPLOY_HOOK` added as a GitHub Actions repo secret — CI auto-deploys to Render on push to
            `main`.
      - [x] cron-job.org keep-warm ping created (`GET /health` every 10 min) against the live Render URL.
      - [x] `.env.example` / `frontend/.env.example` cleaned up: fixed stale `VITE_API_URL` → `VITE_API_BASE_URL`
            (didn't match the actual code, `apiClient.ts:35`) and de-duplicated `frontend/.env.example`.
      - [x] **Resolved:** ran `backend/scripts/seed.js` against the live Atlas `MONGO_URI` — all 3 demo
            accounts (admin/rider/driver) now exist there. See P-002. Login itself is currently blocked by
            the unrelated P-006 incident (see top of this file) — re-verify demo logins once P-006 is fixed.
- [x] **Layer 2 — Redis shared-state layer (sessions + rate limit + Socket.IO adapter; in-memory fallback).**
      - [x] `backend/config/redis.js`: one shared `ioredis` client, `null` when `REDIS_URL` unset.
      - [x] `sessionManager` Redis-backed (same public interface) with in-memory fallback; `getStats`/
            `invalidateSession`/`invalidateUserSessions`/`getUserSessions` now async — 5 call sites updated.
      - [x] Rate limiter (`middleware/security.js`) uses `rate-limit-redis`'s `RedisStore`, one Redis-key
            prefix per named limiter (`auth`/`otp`/`api`/`ride-booking`) when Redis is set — see D-011.
      - [x] Socket.IO `@socket.io/redis-adapter` attached in `server.js` when Redis is set.
      - [x] Removed unused `redis` v4 dep; added `ioredis`, `@socket.io/redis-adapter`, `rate-limit-redis`.
      - [x] `scripts/seed.js`: duplicate-key on insert is now treated as "another instance won the race",
            not fatal — see P-004.
      - [x] `npm run lint` 0/0; `npm test` 164/164 (163 existing + new `sessionManager-redis.test.js`) at the
            time — see the post-Layer-4 hardening note below for the current 173/173 baseline.
      - [x] **Gate run and passed** against real Upstash Redis + Atlas Mongo: two local `node server.js`
            instances, cross-instance Socket.IO room broadcast delivered, session survived an instance
            restart. Full writeup in `DECISIONS.md` ("Layer 2 gate — PASSED").
- [x] **Layer 3 — Load testing with k6 (req/s, p95, concurrent WS, circuit-breaker trip).**
      - [x] `load/rest-ramp.js`: k6 ramp against `GET /health` (100 req/s, p95=3.72ms, 0% errors) +
            capped `POST /api/rides/estimate` (4/min, p95=216.54ms, 0% errors) — see D-012 for why
            `/estimate` is capped, not ramped.
      - [x] `load/ws-hold.js`: Node + `socket.io-client` (already a project dep, same major version as the
            server) holding concurrent authenticated Socket.IO connections — 200/200 connected, 0 dropped
            over a 20s hold.
      - [x] `load/breaker-trip.js`: Node fault-injection against `/api/test/external-service-test` +
            `/health` polling — captured `maps` breaker CLOSED→OPEN (3 failures, threshold 3); OPEN→HALF_OPEN
            not externally observable (single-request transient, documented not fixed).
      - [x] `load/README.md`: results table + reproduction config + honesty-guardrails limitations section.
      - [x] Zero backend runtime code changes.
      - [x] **Gate passed** — see D-013 for full results.
- [x] **Layer 4 — Observability (prom-client /metrics + Grafana Cloud + correlation IDs).**
      - [x] `backend/config/metrics.js`: one `prom-client` `Registry`, default metrics +
            `http_request_duration_seconds` (histogram) + `ride_match_duration_seconds` (histogram) +
            `circuit_breaker_state` (gauge, pull-based off `GracefulDegradationService`).
      - [x] `backend/middleware/metrics.js` records HTTP duration on `res.on('finish')`; `GET /metrics`
            mounted in `server.js` outside `/api` (not rate-limited, same as `/health`).
      - [x] `MatchingService.findNearestDriver` wrapped (internal renamed to `_findNearestDriver`) to time
            every call in a `finally` block, covering all existing early-return paths untouched.
      - [x] `backend/utils/requestContext.js`: `AsyncLocalStorage`-based correlation ID; `logger.js` stamps
            it onto every log line automatically; `requestLogger.js` echoes it as `X-Request-ID`.
      - [x] `npm run lint` 0/0; `npm test` 164/164 — no regressions (see the post-Layer-4 hardening note
            below for the current 173/173 baseline).
      - [x] Local gate: smoke-tested `/metrics` (Prometheus format, all 3 custom metrics present via
            `supertest`) and correlation-ID propagation across an `await` (verified via standalone script).
      - [x] **Grafana Cloud wired and verified end-to-end:** `observability/alloy-config.alloy` +
            `observability/README.md` (Grafana Alloy, run on-demand via Docker — see D-015). Ran locally
            against the live Render `/metrics`; confirmed via Alloy's own `prometheus_remote_storage_*`
            metrics (732 samples sent, 0 failed) and cross-checked in Grafana Cloud Explore. Dashboard panels
            (p50/p95/p99 latency, request rate, error rate, circuit-breaker state) are documented with exact
            PromQL in `observability/README.md`, ready to build before Layer 5's README screenshots.

**Post-Layer-4 hardening pass (P-008 → P-011, 2026-07-24)** — found and fixed while auditing for more
P-007-style "looks wired up, silently isn't" bugs:
- Real per-account-then-IP+account login lockout (`backend/utils/loginLockout.js`, Redis-backed with
  in-memory fallback) replacing dead `bruteForceProtection`/`sessionHijackingDetection` code that referenced
  a `req.session` this JWT-only app never populates (P-008 + follow-up).
- `app.set('trust proxy', 1)` in `server.js` — Render's proxy meant `req.ip` was always `::1`, which had
  silently collapsed the new IP+account lockout back to pure account-scoped (P-009).
- Strengthened login/signup Joi validation (password complexity, name/license/vehicle field patterns) and
  deleted a second, drifting copy of the same schemas in `middleware/validation.js` (P-010).
- Phone format switched from E.164 to 10-digit, no `+`/country code, across backend validators, frontend
  inputs, and test fixtures that exercise real validation (P-011).
- Demo identities renamed (`demoRider1`/`demoDriver1`) and migrated live on Atlas via
  `scripts/reset-demo-accounts.js`; documented in `README.md` (P-011 follow-up).
- Current test baseline: backend **173/173**, frontend **59/59** (up from 164/59 at Layer 4).
- [ ] Layer 5 — README-as-paper & resume bullets.

## Deployed system — quick reference (fill in as layers ship)
- **Live UI:** https://ride-sync-cab-aggregator-platform-f.vercel.app
- **Live API:** https://ridesync-cab-aggregator-platform.onrender.com (`/health`, `/api/*`)
- **Stack:** React + TS + Vite (frontend) · Node + Express + Socket.IO (backend) · MongoDB Atlas M0 (AWS
  N. Virginia) · Upstash Redis (Virginia, not yet consumed by app code — Layer 2). Full env var reference
  kept in the git-ignored root `.env` (never committed; see D-005 for region rationale).
- **Repo:** `origin` = https://github.com/mahendra-kausik/RideSync-Cab_Aggregator_Platform.git.
  Commits authored by user only (no Claude co-author).
- **Env:** Windows 11 / PowerShell. Backend start: `node server.js` (`npm start`); dev: `nodemon` (`npm run dev`).
  Local full stack: `docker-compose up`. Tests: `npm test` (backend Jest), frontend Vitest.
- **Code fixes done this session:** `MapComponent.tsx` crash-risk fix + dead `calculateFare` deletion +
  `ensure-indexes.js` + prod `autoIndex: false` + CI/CD fix (typescript pin + eslint config, see P-001)
  (see checklist above) — all verified, no regressions.
- **Remaining Layer 1 code work:** none blocking — rest of Layer 1 is hosted-account creation + env wiring.

- ~~P-006: `/api/*` hangs/fails on the live Render app~~ — **resolved**. Root cause was Render's
  `REDIS_URL` using `redis://` instead of `rediss://` (TLS); corrected in Render's dashboard, live-verified.
  See all seven entries in `DECISIONS.md`.
- ~~P-002: demo-account login 401s against Atlas~~ — resolved, accounts seeded directly on Atlas.
- Layer 1 hosting free-tier limits confirmed live in practice (Render cold-start behavior, Atlas M0, Upstash
  free tier) — no surprises hit so far.

## Pre-Layer-2 cleanup (2026-07-22)
- Backend lint: 0 errors / 0 warnings (was 0/36 under a `--max-warnings=40` gate). Removed all dead
  imports/locals, prefixed intentionally-unused handler args with `_`. Gate tightened to `--max-warnings=0`.
- Fixed a real gap found via the unused-var audit: admin `GET /api/rides?search=` now actually filters by
  `pickup.address`/`destination.address` (regex-escaped, case-insensitive) — previously silently ignored.
- `sessionHijackingDetection` middleware import removed from `server.js` (was dead-imported, never wired);
  left un-activated by design — see D-007.
- Verified: `npm run lint` clean, `npm test` → 7 suites / 163 tests passing, no regressions.
- **Full logic audit (D-008):** 4-way parallel review of controllers/services/middleware+utils/models+routes+
  config found and fixed 8 real bugs: driver double-booking race (`MatchingService`), duplicate payment
  processing race (`paymentController`), duplicate ride-status-transition race (`rideController` x2), stale
  socket-disconnect wiping a live reconnection (`socketService`), refresh tokens usable as access tokens
  (`sessionManager`), fail-open `optionalAuth` bypassing the session blacklist, body-parser mounted after the
  input-sanitization middleware that reads `req.body` (`server.js` — sanitization was silently no-op-ing on
  every POST/PUT body), and a broken `User.updateRating` that violated its own schema's `max: 5` constraint.
  All fixed, all 163 tests still pass, lint 0/0.
- **Frontend logic audit (D-009):** found and fixed 3 real bugs: `MapComponent`'s `center` prop was passed to
  Leaflet un-flipped (component convention is `[lng, lat]`, Leaflet needs `[lat, lng]`) — the map centered/
  panned to the wrong spot on the globe on every load, even though markers rendered correctly. The backend's
  silent 12h token-rotation headers (`X-New-Access-Token`) were never read anywhere in the frontend, causing
  an unexpected forced logout once a session crossed that age. `AuthContext.register()` never cleared
  `isLoading` on its success path, so an abandoned registration (phone step done, OTP step skipped) left
  `ProtectedRoute` stuck showing a spinner forever. All fixed; `tsc --noEmit` clean, lint clean, 59 frontend
  tests pass.
- **Local dev seeding fixed (P-003):** `docker-compose up` now always has exactly one demo admin/rider/driver
  without any manual step. `backend/scripts/seed.js` rewritten to be idempotent (`ensureDemoAccounts()`,
  create-if-missing via `User.findByPhone`/`findByEmail`, never deletes) and auto-runs from `server.js` on
  every backend boot, gated to never run when `NODE_ENV === 'production'`. Also fixed local `.env`'s
  `NODE_ENV` (was `production`, leaking from a Render-reference comment block into Docker Compose's
  auto-loaded `.env`) back to `development`. Verified live end-to-end: fresh build seeds all 3 accounts,
  restart is a no-op, all 3 (`admin@cabaggreg.local`/`admin123`, `+1234567890`/`rider123`,
  `+1234567892`/`driver123`) log in successfully via the running API.

## Decisions log (one-line index — full entries in `DECISIONS.md`)
- D-001 — Hosting = Render + Vercel + Atlas M0 + Upstash Redis (free, no card, native WebSocket).
- D-002 — Redis for shared state (sessions + rate limit + sockets) with in-memory fallback.
- D-003 — `@socket.io/redis-adapter` over sticky sessions for cross-instance socket delivery.
- D-004 — Explicit `ensure-indexes.js` script + `autoIndex: false` in production.
- D-005 — Hosted-service regions: Render/Upstash Virginia, Atlas AWS N. Virginia.
- D-006 — GCP Cloud Run considered and rejected for the 3-4 month placement-season lifespan; stayed on Render free.
- P-001 — CI/CD build job fixes (typescript pin, eslint config, Mongo test wiring).
- P-002 — Demo-account login 401 on fresh Atlas deploy (seed data never migrated).
- D-007 — Backend lint cleanup: zero-warning gate + implemented admin ride search.
- D-008 — Fixed 8 logic bugs from full backend audit (races, auth fail-open, body-parser order, schema bug).
- D-009 — Fixed 3 frontend logic bugs (map center lat/lng swap, unhandled token rotation, stuck register spinner).
- P-003 — Idempotent local demo-account seeding + fixed local .env NODE_ENV leaking from Render reference block.
- D-010 — Layer 2: ioredis-backed sessionManager/rate-limiter/Socket.IO adapter, in-memory fallback preserved.
- P-004 — Layer 2 gate caught a demo-seed race between concurrently-booting instances; fixed (idempotent-on-conflict).
- D-011 — Layer 2 gate caught a rate-limiter Redis-key collision across limiters; fixed (per-limiter key prefix).
- P-005 — Render deploy crash: unhandled Redis errors + `maxRetriesPerRequest` fatal on boot churn; fixed
  (`maxRetriesPerRequest: null`); post-fix idle-reconnect cycling confirmed expected/harmless.
- D-012 — Layer 3 REST load test targets `/health` for throughput; `/api/rides/estimate` capped, not ramped,
  due to a global `apiRateLimiter` + `apiAbuseDetection` gate on all `/api/*` routes the earlier plan missed.
- D-013 — Layer 3 acceptance gate results (REST/WS/circuit-breaker numbers).
- D-014 — Layer 4: prom-client `/metrics` (default + 3 custom metrics) + AsyncLocalStorage correlation IDs.
- D-015 — Grafana Cloud dashboard fed by a local, on-demand Grafana Alloy scraper (verified end-to-end).
- P-006 — **RESOLVED.** Seven entries in `DECISIONS.md`. Application-level bug (indefinite hang) fixed via
  two crash-loop-regression reverts (`823cfc3`, `29b0e60`), a library-internal retry loop fixed by dropping
  `rate-limit-redis` for a first-party store (`499a47a`), reconnect pacing tuned (`a91f27f`). The actual
  live-incident trigger was an env var: Render's `REDIS_URL` used `redis://` instead of `rediss://` (TLS) —
  found by diffing working local config against Render's dashboard after `CLIENT LIST` diagnostics ruled out
  every code-level and Upstash-side explanation. Corrected by the user in Render's dashboard, live-verified.
- P-007 — **FIXED.** PII encryption (`AES-256-GCM`, a stated project claim) was silently no-op'ing on every
  save for every user since the feature was written: `encryption.js`'s `setNestedValue` mutated Mongoose
  documents via plain bracket assignment, which Mongoose doesn't persist for nested paths — only `.set()`
  does. Fixed the one function; re-encrypted the 3 (only) existing users in Atlas via
  `backend/scripts/reencrypt-demo-accounts.js`; verified genuinely-encrypted-at-rest via the native MongoDB
  driver (bypassing Mongoose's own decrypt hooks, which had been masking the bug in earlier checks). Live
  login re-verified working. Full writeup in `DECISIONS.md`.
- P-008 — Brute-force account lockout was dead code (referenced a `req.session` this JWT-only app never
  populates); replaced with real account-scoped lockout on `User`.
- P-008 (follow-up) — Account-scoped lockout let one attacker DoS the real user; moved to Redis-backed
  IP+account-scoped lockout (`backend/utils/loginLockout.js`), superseding the `User`-schema fields.
- P-009 — Live IP+account lockout still collapsed to account-only: Render's proxy meant `req.ip` was always
  `::1`; fixed via `app.set('trust proxy', 1)`.
- P-010 — Strengthened login/signup Joi validation; found and deleted a second, drifting copy of the same
  schemas in `middleware/validation.js`.
- P-011 — Phone format switched from E.164 to 10-digit (no `+`/country code) across backend validators,
  frontend inputs, and real-path test fixtures.
- P-011 (follow-up) — Demo identities renamed (`demoRider1`/`demoDriver1`) and migrated live on Atlas via
  `scripts/reset-demo-accounts.js`; documented in `README.md`. Found (not removed) a stray 4th Atlas account.

## Open items
- P-009: live re-verification pending — confirm distinct client IPs for two different devices in Render's
  logs after the `trust proxy` fix's next deploy.
- Stray Atlas account: a 4th `users` document beyond admin/rider/driver (phone `4444444444`, name `"User"`,
  the schema default) — almost certainly a throwaway manual test registration from the P-008/P-009 live
  testing session, not seed data. Left alone pending the user's call on whether to delete it.

## How to resume
1. Read this file, then `CLAUDE.md`. P-006 is closed — no action needed there. The post-Layer-4 hardening
   pass (P-008 → P-011, above) is also done and verified (173/173 backend, 59/59 frontend) — no action
   needed unless picking up the two Open items above.
2. Resume **Layer 5 — README-as-paper & defense** (pending approval, not yet started). Build only that
   layer, run its gate, update this file + `DECISIONS.md`, then STOP and ask for approval before anything
   further. The README must reflect the current demo credentials (`demoRider1`/`demoDriver1`), the 10-digit
   phone format, the lockout story, and the 173/173 + 59/59 test baseline — not the Layer-4-era numbers.
