# PROGRESS.md — Running State

> **Read first at session start; update at the end of every layer. Keep it short.**
> This is the resume doc — the *what shipped* index. Full rationale for every choice
> lives in `DECISIONS.md`; headline numbers + architecture live in `README.md`.

## Current status
**As of 2026-08-03: all 6 layers shipped (Layer 5 — README-as-paper — is done, see the Layer checklist
below), P-006 → P-022 post-ship fixes shipped and verified. P-023 is fully shipped this session: Phase 1
(matching actually finds drivers) and Phase 2 (sequential offer/accept/decline flow, D-018) are both
done. Backend 189/189 tests (5 new offer-flow tests added), frontend type-check clean, 59/59 tests. Not
yet pushed to remote or re-verified against a live deploy.**
The narrative below is
kept as the historical build log; each entry's numbers are accurate as of when it was written, not
necessarily current — see `PROGRESS.md`'s per-P-XXX entries further down for the latest state of any
given area, or `README.md` for the always-current headline numbers.

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
      - [x] **Dashboard built and public:** 4 panels (latency p50/p95/p99, request rate, 5xx error rate,
            circuit breaker state) built in Grafana Cloud, all showing live data from the Render deploy.
            Public link: https://scarletmeerkat3462.grafana.net/public-dashboards/7a50287abc8e4c8c930568ff8b455530
            (see `observability/README.md`). One snag: State timeline's default Color scheme uses
            thresholds (a stray default step at 80) ahead of value mappings — fixed by setting Color scheme
            to "Single color" so the 0/1/2 → CLOSED/HALF_OPEN/OPEN mappings render correctly.
            **Layer 4 fully closed — no more manual follow-up.**

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
- Test baseline at the time: backend **173/173**, frontend **59/59** (up from 164/59 at Layer 4) —
  superseded by later post-ship fixes; see "Current status" at the top of this file for the real
  current count.
- [x] **Layer 5 — README-as-paper & defense.** `README.md` rewritten from the pre-upgrade
      "student" version into the project paper: live links (UI/API/Grafana) + rider/driver demo
      creds up top (admin dropped per griefing-reduction call), deployed-state ASCII architecture
      diagram, a "what makes it production-shaped" section (deployed / horizontally scalable /
      load-tested / observable / hardened) each pointing at its evidence, the `load/README.md`
      results table, corrected tech stack (Leaflet/OSM not Mapbox; added ioredis, prom-client, k6),
      and an honest-caveats section (local-not-live load tests, per-instance breaker, no key
      rotation, mock payments, ephemeral audit logs). **All numbers re-verified this session:**
      backend **173/173**, frontend **59/59**, live UI/API/`/metrics`/Grafana all 200. The stale
      "578 tests / 71.76% coverage" claim was removed — the real curated suite is 173 tests and
      measured statement coverage is ~32% (D-016); README states test counts only, no coverage %.
      Rate-limit values in the security section corrected to the real config (auth 20/5min, etc.).

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
- D-016 — Layer 5 README-as-paper: corrected stale 578/71.76% test claim to verified 173/173 + 59/59
  (coverage % omitted per user), fixed stack (Leaflet/OSM not Mapbox) and rate-limit values, dropped admin creds.
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
- D-017 — Driver's active-ride card now shows the rider's name + phone (mirrors the existing rider→driver
  display; backend already populated this data). Removed the unenforced, buggy "share location" toggle —
  location now flows to the rider for the whole active-ride lifetime, no opt-out. Header username visible
  on mobile again (was hidden below 768px). Frontend build clean, 59/59 frontend tests pass.
- P-012 — Fixed a rider/driver distance mismatch (rider showed live OSRM road distance, driver showed the
  Haversine distance the fare was actually based on — now both show the ride's canonical
  `estimatedDistance`/`estimatedDuration` once booked) and a driver-side "Driver no longer available" 409
  on Accept: `getPendingRides` now hides rides from a driver whose own `isAvailable` is `false` instead of
  showing an always-failing Accept button. **`demoDriver1`'s `isAvailable` was still stuck `false` in
  Atlas at last check** (leftover from an earlier session's incomplete ride) — toggle its availability off
  then on in the driver dashboard to force it back to `true` before demoing Accept Ride. Also fixed dead
  error-unwrapping code in `rideService.ts.acceptRide` (checked `error.response?.data?.error`, but
  `apiClient.ts`'s interceptor already flattens errors to `{code, message}` — friendlier
  `ASSIGNMENT_CONFLICT` message was never reachable). Backend 173/173, frontend 59/59, build clean.
- P-013 — **Corrects P-012's distance fix**, which was backwards: the driver's *active* ride card doesn't
  use `ride.estimatedDistance` at all once accepted — `ActiveRideSection` prefers the live OSRM route
  `DriverDashboardPage` already fetches per active ride. That OSRM number is the same one the rider's
  `routeMetrics` already held from fare estimation (same coords, deterministic OSRM route) — P-012 broke
  that pre-existing agreement by forcing the rider onto the Haversine value instead. Reverted
  `RiderBookPage.tsx` back to `routeMetrics?.distanceKm ?? fareEstimate.distance`. Separately, fixed a
  double-submit race on Accept Ride: the button had no in-flight guard, so a fast double-click (or a slow
  first response) could fire two accept requests for the same ride — the first succeeds, the second
  legitimately 409s, and the error could land after the success and show a misleading "already accepted"
  banner on a ride that was, in fact, just accepted. Added an `acceptingRideId` guard in
  `DriverDashboardPage.handleAcceptRide` and disabled/relabeled the button in `PendingRidesSection` while a
  request is in flight. Frontend build clean, 59/59 tests pass (backend untouched this round).
- P-014 — Fixed the "preview vs. final" distance gap P-013 explicitly left untouched: pending ride cards
  (pre-accept) showed the Haversine `ride.estimatedDistance`/`estimatedDuration` while every other distance
  display (rider overlay, driver post-accept) fetches the real OSRM road distance. Added a small
  `RideDistance` subcomponent in `PendingRidesSection.tsx` that fetches OSRM per pending ride on mount,
  falling back to the Haversine field if the fetch fails. Frontend build clean, 59/59 tests pass.
- P-015 — Fixed pending rides not appearing after turning availability on (only showed after an off/on
  cycle). Root cause: `loadPendingRides` has 5 call sites (mount, socket event, toggle, accept-error
  recovery, manual refresh) with no request sequencing — a slow, stale request from mount (issued while
  still offline, legitimately empty) could resolve after a later correct request and overwrite it back to
  `[]`. Added a `pendingRidesRequestId` ref counter so only the latest-issued request's result is applied
  to state. Frontend build clean, 59/59 tests pass.
- P-016 — **P-015 misdiagnosed the pending-rides bug** — its request-sequencing fix was real but didn't
  fix the reported symptom. Actual cause: toggling availability calls `updateUser`, which gives the `user`
  object a new reference every time; `SocketContext`'s connect effect depended on that whole object, so
  **every toggle tore down and recreated the driver's socket**. The backend treats any driver disconnect
  as "gone offline" and immediately wipes `driverInfo.isAvailable` in Mongo, racing (and usually beating)
  the in-flight pending-rides fetch — with nothing to restore it on reconnect. Fixed by (1) depending on
  `user?._id`/`user?.role` instead of the object in `SocketContext`, and (2) replacing the backend's
  immediate wipe with a 30s reconnect grace period (`config/security.js` → `presence.driverDisconnectGraceMs`)
  so a real drop still marks the driver unavailable but a blip/re-init doesn't. This is also what caused
  `demoDriver1`'s stuck-`false` availability noted back in P-012. Separately fixed the false "Failed to
  update ride status" error on Start Ride: `updateRideStatus` read the wrong error shape (same bug class
  `acceptRide` was already fixed for) so every failure showed a generic message, and `handleRideStatusUpdate`
  had no double-submit guard (same class as P-13's Accept Ride fix) so a double-click could show a stale
  409 error on a ride that had, in fact, just started. Added a small `socketService-presence.test.js` unit
  test (fake timers) covering the grace-period behavior. Backend 176/176, frontend build clean, 59/59 tests.
- P-017 — Fixed two bugs sharing one root cause: driver signups always became riders, and every signup
  displayed as "User". Registration name/role/driverInfo were round-tripped through the client between
  register-phone and verify-otp, and only echoed back when `NODE_ENV === 'development'` — silently
  `undefined` in production, so verify-otp's `|| 'User'` / `|| 'rider'` fallbacks fired on every deployed
  signup. Moved pending registration server-side onto the OTP document (`pendingRegistration`, reaped by
  the existing 5-minute TTL); verify-otp now returns `400 REGISTRATION_EXPIRED` instead of defaulting if
  it's missing. `RegisterPage.tsx` now navigates post-verify off the server-returned role. Added a
  driver-signup regression test and an expired-registration test. Backend 178/178, frontend build clean,
  lint clean, type-check clean, 59/59 tests.
- P-018 — Investigated "admin pages show nothing when new users sign up." Root cause: registering a new
  account in a second tab of the same browser overwrites the admin's `localStorage` token (one shared key,
  one active identity per browser) — every subsequent admin API call then 403s. Compounded by all four
  admin pages reading the wrong error shape, so a 403/500/timeout all rendered the same generic banner.
  Fixed the error-shape bug (7 call sites, `err.message` instead of `err.response?.data?.error?.message`)
  so failures are now legible. Did **not** change the localStorage-collision behavior itself — discussed
  with the user, who will register test accounts from incognito/a second browser going forward. Added
  `backend/scripts/cleanup-accounts.js` (dry-run by default, `--apply` to write) to delete every account
  except admin + the two demo accounts, plus rides referencing deleted users — **not yet run**, needs the
  user to execute it against Atlas.
- P-019 — Fixed the two items flagged (not fixed) at the end of P-017/P-018: profile edits bypassed PII
  encryption, and admin user search always returned zero results. `updateProfile`/`updateDriverProfile`
  used `findByIdAndUpdate`, which skips the `pre('save')` encryption hook — converted both to
  fetch-then-`.save()`, matching the pattern `updateLocation`/`suspendUser` already used elsewhere in the
  same file; also removes `updateDriverProfile`'s old `runValidators: false` workaround as a byproduct.
  `getAllUsers`'s search used `$regex` against ciphertext (AES-256-GCM, random IV per value — confirmed
  non-deterministic by reading `encryption.js`), which can never match; switched to fetching the
  role/status-filtered set and matching in application code against the already-decrypted fields, with
  a `ponytail:` comment on the unbounded `find()` given the small real dataset. Added 4 new integration
  tests (none existed for either endpoint before): 2 confirm the raw Mongo document holds ciphertext
  after a profile update, 2 confirm search finds/excludes correctly. Also had to mount `/api/users` in
  `__tests__/helpers/testApp.js`, which wasn't wired into the test app at all. Backend 182/182, frontend
  unaffected (re-ran lint/build as a safety net, unchanged). Full root-cause writeup and the
  stale-`email_hash`-on-unset bug discovered (and left out of scope) in DECISIONS.md P-019.
- P-020 — Three requested fixes. (1) Removed mock-card checkout from `PaymentForm.tsx`/`paymentService.ts`
  — cash-only now, no method picker; this also deleted a live bug (`cardDetails` hardcoded a past
  `expiryYear`, which both the client and backend validators rejected). Backend `mock` enum left in place
  so historical rides still render. (2) Riders were never redirected to payment on ride completion — the
  only path was a mislabeled "Rate Ride" button. Added `navigate()` to `RiderBookPage`'s `completed` socket
  handlers (`useNavigate` wasn't even imported there); `RideCompletion.tsx`'s existing
  payment→rating→receipt state machine needed no changes, just a heading ("Pay for the ride") and a
  My Rides button label that now tracks `payment.status`. (3) Admin "Total Users" over-counted by exactly
  one: `getAllUsers` excludes admins, `getPlatformStats`'s rollup didn't. Fixed at the rollup (not the
  aggregate) so `users.admins` stays reported. Added 1 new integration test for the previously-uncovered
  `/users/admin/stats` endpoint. Backend 183/183, frontend lint 0 errors/12 warnings (baseline), type-check
  clean, build clean, 59/59 frontend tests. Full writeup in DECISIONS.md P-020.
- P-021 — Two requests: driver earnings crediting before payment, and whether password encryption works
  on profile edits. (1) Earnings turned out to have no stored balance at all — every earnings figure is
  computed on read by summing completed rides' fares, in 4 backend places plus one frontend calc, none of
  which checked `payment.status`. Added `'payment.status': 'completed'` to all 5. Also unified a pre-existing
  split where the driver's own profile page showed 100% of fare while My Rides showed 80% for the same
  rides — added `driverSharePct: 0.8` to `FareService.PRICING_CONFIG` and applied it everywhere (mirrored
  frontend-side as `DRIVER_SHARE_PCT`, since the frontend can't import backend config for one number).
  My Rides' per-ride earnings row now shows "Awaiting payment" instead of a figure when unpaid, so rows and
  the total agree. (2) Investigated and found **no bug**: `changePassword` already fetches-then-`.save()`s,
  so the bcrypt pre-save hook fires (12 rounds); PII fields already encrypt correctly on profile edits since
  P-019. Passwords are hashed, not encrypted — correct by design, since hashing is one-way. Fixed the two
  real gaps found along the way: added a regression test for `PUT /users/password` (none existed — asserts
  the raw stored value is a bcrypt hash, not plaintext, and that login works with the new password/fails
  with the old), and converted `scripts/reset-password.js` off its own duplicate `bcrypt.hash` call to the
  same fetch-then-`.save()` pattern. Backend 184/184, frontend lint 0 errors/12 warnings (baseline),
  type-check clean, build clean, 59/59 frontend tests. Historical rides completed-but-unpaid before this
  change will show lower earnings on next read (no data rewritten, per user's call) — full writeup in
  DECISIONS.md P-021.
- P-022 — The P-021 push (a384749) failed GitHub Actions. Diagnosed via `gh` CLI (installed via winget,
  logged in with device-flow auth — neither was available beforehand). Root cause was unrelated to P-021:
  `services-matching.test.js`'s 3 single-call "performance" tests timed a sub-millisecond operation with
  `Date.now()`, which only has millisecond resolution — any run straddling a tick boundary reads as "1ms"
  and fails a `toBeLessThan(1)` assertion even though the true duration is microseconds. Passed locally
  (faster/less loaded machine, both parallel and `--runInBand`) but flaked on CI's shared runner. Switched
  all 3 to `process.hrtime.bigint()` (nanosecond resolution). The 4th performance test (1000 iterations,
  100ms budget) was untouched — enough margin at that scale to not be timing-sensitive. Backend 184/184,
  lint clean. Full writeup in DECISIONS.md P-022.
- P-023 Phase 1 — User reported ride booking usually finds no driver, and when it does the ride is
  auto-assigned with no acceptance step. Investigation found **three** independent root causes (full
  writeup in DECISIONS.md P-023): (1) an available-but-not-yet-on-a-ride driver's location was never
  written to the DB, so matching searched stale coordinates; (2) automatic matching threw on every attempt
  (`.toObject()` called on a `.lean()` result) and was silently caught, so it had never once succeeded —
  every prior successful match came through the manual pending-list Accept; (3) a driver with no GPS fix
  yet fell back to an unfiltered global ride list, masking cause #1. Fixed all three: split the driver
  location-update effect so the DB write isn't gated on an active ride (throttled to >50m/>15s to avoid a
  write per GPS tick), removed the `.toObject()` crash, and replaced the global fallback with an empty
  result + re-fetch once GPS resolves. Also removed dead Bengaluru-fallback pickup code from the rider
  booking page — decided **against** re-enabling rider auto-geolocation (D-017): the stub predates this
  repo's history and disabling it is likely *why* that Bengaluru fallback was never a live problem; turning
  it back on would have activated it.
- P-023 Phase 2 — The other half of the same report: rides were auto-assigned (`requested → accepted` in
  one atomic step) with no driver consent. Implemented sequential offers (full writeup in DECISIONS.md
  D-018): nearest driver gets a 30s time-boxed `matched` offer via the new `MatchingService.offerRideToDriver`
  (renamed from `assignRideToDriver`, same atomic guard/rollback structure); driver responds via the
  existing `POST /rides/:id/accept` or the new `POST /rides/:id/decline`. Decline or a 30s timeout (an
  in-process `setInterval` sweeper in `server.js`, `MatchingService.expireStaleOffers`, since a per-ride
  `setTimeout` wouldn't survive a Render restart) reverts the ride to `requested`, records the driver in a
  new `rejectedBy` array, releases their availability lock, and immediately re-matches excluding everyone
  who's already passed. New `ride:offer`/`ride:offer-expired` socket events and a driver-side `OfferCard`
  component (accept/decline buttons, live countdown) round it out. `Ride` schema gained `offerExpiresAt`
  and `rejectedBy`. 5 new tests cover offer/accept/decline/expire/no-re-offer-to-rejected. Backend
  **189/189**, frontend type-check clean, **59/59** frontend tests.

## Open items
- ~~P-009: live re-verification~~ — **resolved**: confirmed live from two different devices; `trust proxy`
  fix works (distinct client IPs, IP+account lockout genuinely IP-scoped in production).
- ~~Stray Atlas account (phone `4444444444`)~~ — **resolved**: deleted from Atlas by the user. Live `users`
  collection is back to admin/rider/driver only.
- ~~Run `node backend/scripts/cleanup-accounts.js --apply` against Atlas~~ — **resolved**: run successfully
  by the user; test accounts accumulated while P-017 was live have been removed from the live Atlas
  database. The script was since extended to also delete every completed ride (commit `8b29b37`, not
  separately logged with a P-number), so this run also cleared all ride history.

## How to resume
1. Read this file, then `CLAUDE.md`. All 6 layers are shipped, including **Layer 5 — README-as-paper**
   (see the Layer checklist above — this was previously mis-stated as pending in this section; it shipped
   as commit `e95217a`). P-023 (both phases) is shipped. Current verified baseline: backend **189/189**,
   frontend type-check clean, **59/59** — not yet re-checked in CI, not yet pushed to remote, and the live
   deploy has not been re-verified against these changes.
2. No queued layer or open plan to act on. If resuming after a long gap, sanity-check the live deploy
   (`/health`, a demo login, an actual two-browser ride-offer test) before assuming anything above is
   still true — free-tier hosts and long idle periods are the likeliest sources of drift.
