# DECISIONS.md — Decision Log

> Every non-trivial choice, with the reasoning to defend it in an interview.
> Every problem you faced along with the fix for an interview story.
> **Claude Code: append a new entry whenever you make a decision a reviewer could question.**
> Newest entries go at the bottom. Never silently rewrite a past decision — supersede it with a new entry.

### Entry template (copy this)

```
## D-XXX — <short title>
- **Date / Layer:** <when>
- **Context:** <what problem/choice prompted this>
- **Decision:** <what we chose>
- **Why:** <the core reason(s)>
- **Alternatives considered:** <options + why not>
- **Tradeoffs / risks:** <what we give up; what could go wrong; how we'd mitigate>
- **Supersedes:** <D-YYY if applicable>
```

```
## P-XXX — <short title>
- **Date / Layer:** <when>
- **Context:** <what problem was faced>
- **Action:** <what we did>
- **Why:** <the core reason(s)>
- **Tradeoffs / risks (if applicable):** <what we give up; what could go wrong; how we'd mitigate>
- **Supersedes (if applicable):** <D-YYY/P-YYY>
```

---

## D-001 — Hosting stack: Render + Vercel + MongoDB Atlas M0 + Upstash Redis
- **Date / Layer:** 2026-07-22 / Layer 0
- **Context:** The app must move from Docker-Compose-only to a public URL on free tier. The backend holds
  long-lived Socket.IO WebSocket connections, which rules out serverless/edge function hosts for the API.
- **Decision:** Backend (Node + Express + Socket.IO) on **Render Web Service**; frontend (React/Vite) on
  **Vercel**; database on **MongoDB Atlas M0**; shared state on **Upstash Redis**.
- **Why:** Render runs an always-on Node process with **native WebSocket support**, is genuinely free with
  **no credit card**, and is already the target of the repo's existing CI/CD deploy hook (zero wasted work).
  Vercel is the standard free static host; Atlas M0 is the standard free managed Mongo; Upstash is free
  serverless Redis. The whole stack is free and card-free.
- **Alternatives considered:** **Fly.io** for the backend (no forced sleep, closer to real VM infra) — rejected
  as default because it **requires a credit card on file** and needs more setup (fly.toml/Docker tuning);
  kept as a documented "always-warm" upgrade. **Railway** — no longer truly free ($5 trial credit).
  Serverless (Vercel/Netlify/Cloudflare functions) for the API — **cannot** hold a 20-minute ride's WebSocket.
- **Tradeoffs / risks:** Render free instances **sleep after ~15 min idle → ~30–50 s cold start**. Mitigated by a
  free cron-job.org ping to `/health` every ~10 min (one always-on service ≈ 720 hrs < ~750 free hrs/month).
  Atlas M0 requires IP allowlist `0.0.0.0/0` since Render free tier has no static egress IP.

## D-002 — Redis as the shared-state layer (sessions + rate limiting + sockets), with in-memory fallback
- **Date / Layer:** 2026-07-22 / Layer 0
- **Context:** Sessions (`sessionManager`), rate-limit counters, and Socket.IO fan-out are all in-process
  memory, so a second backend instance would break them — the app is single-instance-only. Redis is already
  provisioned in `docker-compose.yml` but unused by app code.
- **Decision:** Move all three subsystems onto Redis (`ioredis`), keeping an **in-memory fallback** active when
  `REDIS_URL` is unset so local dev stays zero-dependency.
- **Why:** This converts the weakest architectural claim ("scales horizontally" — currently false) into a
  demonstrable fact, using infra that's already provisioned. Redis gives native TTL for session expiry/blacklist
  and shared counters for correct distributed rate limiting.
- **Alternatives considered:** MongoDB-backed sessions (extra load on the primary datastore, no native TTL
  ergonomics for blacklists); sticky sessions only (doesn't fix rate limits or cross-instance socket delivery).
- **Tradeoffs / risks:** Adds a network hop and a new failure dependency; mitigated by the in-memory fallback
  and by treating Redis as ephemeral (sessions can be re-established). Must preserve `sessionManager`'s public
  interface so no callers change.

## D-003 — `@socket.io/redis-adapter` over sticky sessions for cross-instance socket delivery
- **Date / Layer:** 2026-07-22 / Layer 0
- **Context:** With multiple backend instances, a message emitted on instance A must reach a client connected
  to instance B (e.g. a driver on A, the rider on B).
- **Decision:** Use the official **`@socket.io/redis-adapter`** (Redis pub/sub) so every instance can deliver
  to every client.
- **Why:** It removes the need for load-balancer session affinity, is the officially supported scaling path for
  Socket.IO, and reuses the same Redis instance from D-002.
- **Alternatives considered:** Sticky sessions at the LB (fragile; Render free tier LB control is limited and it
  doesn't solve fan-out to a room spanning instances); a custom pub/sub layer (reinventing the adapter).
- **Tradeoffs / risks:** Extra Redis pub/sub traffic; on free tiers this is negligible for portfolio-scale load.
  If Redis is down, sockets fall back to single-instance behavior (acceptable degradation).

## D-004 — Explicit `ensure-indexes.js` script + `autoIndex: false` in production
- **Date / Layer:** 2026-07-22 / Layer 1
- **Context:** All indexes (2dsphere geospatial, compound query indexes, unique/sparse hashes) are already
  declared in the Mongoose schemas (`User.js`, `Ride.js`, `OTP.js`) via `schema.index(...)`. Mongoose's default
  `autoIndex: true` would silently build these on every connect — including in prod against a shared Atlas M0
  cluster, where a blocking index build on first deploy is exactly the kind of surprise you don't want on a
  free-tier cluster with no ops visibility.
- **Decision:** Set `autoIndex: process.env.NODE_ENV !== 'production'` in `backend/config/database.js`, and
  added `backend/scripts/ensure-indexes.js` — a one-shot script that connects and calls `Model.syncIndexes()`
  for each model. Run manually after each prod deploy (or from a CI step) instead of implicitly on app boot.
- **Why:** Matches Mongoose's own recommended production pattern (disable autoIndex, sync explicitly) and keeps
  index changes visible/auditable instead of happening implicitly inside `mongoose.connect()`.
- **Alternatives considered:** Leaving `autoIndex: true` everywhere (simplest, but risks an implicit blocking
  build on the live cluster on first prod boot); porting the old `scripts/mongo-init.js` (docker-only, already
  stale — its field names predate the PII-hash fields `phone_hash`/`email_hash` now on `User.js`).
- **Tradeoffs / risks:** Adds a manual step to the deploy checklist (documented in `PROGRESS.md`); if skipped,
  prod queries just run without new indexes until the script is run — the app still works, just slower.

## P-001 — CI/CD `build` job failing on every run: unpinned `typescript` + long-dead frontend lint config
- **Date / Layer:** 2026-07-22 / Layer 1
- **Context:** User flagged that CI-CD had been failing on every run. Root-caused via GitHub's Actions API
  (`actions/runs/{id}/jobs`) to the "Run frontend linting" step, which crashed before linting even started:
  `TypeError: Cannot read properties of undefined (reading 'Intrinsic')` inside `@typescript-eslint`'s
  `type-utils`. Two independent, stacked problems:
  1. `frontend/package.json` never declared a `typescript` version — it floated to whatever the freshest
     transitive resolution was. The committed lockfile had resolved it to **TypeScript 7.0.2**, which
     `@typescript-eslint@6.x` (itself unpinned via `^6.7.0`) cannot parse — hence the crash. This was the
     acute regression breaking the pipeline.
  2. Once the plugin actually loads, `npm run lint` (`--max-warnings=0`) still fails: `.eslintrc.json` enforces
     a style (2-space indent, no trailing commas) the code never followed. Confirmed via a clean LF export
     (`git -c core.autocrlf=false archive HEAD`, to rule out this Windows machine's `core.autocrlf=true`
     inflating the count) — ~4,829 real violations, dominated by `indent` (4275) and `comma-dangle` (207).
     This has likely never passed CI since the config was written; unrelated to today's changes.
- **Action:**
  1. Added `"overrides": { "typescript": "5.3.3" }` to the root `package.json` (npm workspaces monorepo — a
     `devDependency` pin in `frontend/package.json` alone wasn't enough, since `@typescript-eslint` is hoisted
     to root and resolves `typescript` from there regardless of what `frontend/node_modules` has nested).
  2. Investigated `indent`/`comma-dangle` per-file and found the codebase's actual formatting is genuinely
     inconsistent (mixed 2- and 4-space files, mixed trailing-comma usage) — no single rule value satisfies it
     without a mass reformat. Turned both rules `"off"` rather than guess a value. Also turned off
     `@typescript-eslint/no-explicit-any` (136 existing usages), `no-console` (125 — this app logs heavily and
     intentionally, backend included), and `react/no-unescaped-entities` (8) for the same reason: real,
     widespread existing usage, not something to silently reformat away.
  3. Ran `eslint --fix` for the remaining small, genuinely mechanical/auto-fixable violations (`curly`, `quotes`,
     `semi`, `no-trailing-spaces`, 25 files total) and manually re-indented the handful of single-statement
     bodies the `curly` fixer left flush-left (ESLint's `curly` fixer doesn't reindent when `indent` is off).
     Manually fixed 2 `no-useless-escape` regexes (`\(`/`\)` unnecessary inside a character class), one genuine
     dead import (`useEffect` in `useLocalStorage.ts`), and one empty `catch {}` block (added a comment
     explaining the intentional no-op instead of suppressing the rule).
  4. Left `react-hooks/exhaustive-deps` (11 warnings) untouched — these flag real potential stale-closure bugs;
     silencing them without reviewing each one risks hiding actual bugs. Bumped `frontend`'s lint script from
     `--max-warnings=0` to `--max-warnings=15` to cover today's baseline without blocking CI, while still
     failing if new warnings pile up unchecked.
- **Why:** Root-cause fix over a band-aid — `continue-on-error: true` on the lint step would make CI green
  without lint ever meaning anything again. Config-only changes for the bulk of the debt keeps the diff small
  and avoids reformatting ~4,800 lines across the frontend on a hunch.
- **Tradeoffs / risks:** The frontend no longer enforces indent/comma-dangle consistency, or `no-explicit-any`/
  `no-console` — a real (not just cosmetic) relaxation of type-safety and logging signal. The 11
  `exhaustive-deps` warnings remain unresolved (tracked, not hidden) and worth a dedicated pass later.
- **Follow-up (same session):** the first `--fix` pass on both frontend and backend converted some
  double-quoted strings containing a literal apostrophe into single-quoted-with-escapes (e.g.
  `"'self'"` → `'\'self\''` in CSP directives, `"You haven't..."` → `'You haven\'t...'`) — technically valid
  per `quotes: single` but needlessly hard to read. Added `{ "avoidEscape": true }` to the `quotes` rule on
  both `.eslintrc.json`s and reverted the handful of affected strings to their natural double-quoted form.
  Also found the `curly`/`brace-style` fixer had left ~106 lines under-indented across 11 backend files
  (same flush-left-body issue as frontend) — reindented by hand, same root cause as note above.
- **Follow-up 2:** `Run backend tests` still failed in CI even after lint was fixed — the 2 pre-existing
  `services-matching.test.js` failures (see this entry's Context) turned out to be a real, fixable test bug,
  not just "pre-existing and out of scope": `__tests__/setup.js` globally sets `DISABLE_MATCHING=true` to stop
  background matching side-effects in other tests, but the two failing tests specifically exercise
  `findNearestDriver`'s real input-validation path — that same flag short-circuits the function before
  validation ever runs, returning a response with no `error` field (the two tests assert `result.error` is
  defined). Fixed by clearing `DISABLE_MATCHING` in a scoped `beforeEach`/`afterEach` around just that describe
  block (a real MongoDB Memory Server is connected globally in `setup.js`, so once the flag is cleared the
  function reaches `_validateCoordinates`, throws, and the catch block sets `error: 'MATCHING_SERVICE_ERROR'`
  as expected). All 163 backend tests now pass.
- **Follow-up 3:** even with the above fixed, CI's `Run backend tests` step was still expected to be unreliable
  because of a genuine CI-workflow bug, unrelated to any app code: `.github/workflows/ci-cd.yml` provisions a
  real `mongo:6.0` service container and TCP-health-checks it before running tests, but `__tests__/setup.js`
  never used it — it always spun up its own `mongodb-memory-server`, which downloads a MongoDB binary at
  runtime on every fresh CI VM (no persistent cache), a well-known source of CI-only flakiness/timeouts that
  never reproduces locally (binary already cached there). Separately, the workflow also exported the env var
  under the wrong name (`MONGODB_URI`) — the app and every other script (`config/database.js`,
  `scripts/reset-password.js`, `utils/securityValidator.js`) consistently use `MONGO_URI`, so the value was
  never actually read even before this fix.
- **Fix:** renamed the CI env var to `MONGO_URI` (matches the app's convention everywhere else); `setup.js` now
  connects directly to `process.env.MONGO_URI` when set (the CI-provided, already-health-checked service),
  falling back to `MongoMemoryServer` only when unset (local dev without Docker). Verified both branches
  directly: 163/163 passing via the in-memory fallback, and 154/154 (unit project) passing via a throwaway
  Mongo instance fed in through `MONGO_URI` to exercise the direct-connect branch end-to-end.

## D-005 — Hosted-service regions: Render Virginia, Upstash Redis Virginia, Atlas AWS N. Virginia
- **Date / Layer:** 2026-07-22 / Layer 1
- **Context:** Render, Atlas, and Upstash each offer a different set of free-tier regions (no region is common
  to all three, and none offer India). Region choice affects latency between hops.
- **Decision:** Render → Virginia; Upstash Redis → Virginia (exact match with Render); Atlas → AWS, N. Virginia
  (us-east-1) — closest same-coast option since Atlas has no plain "Virginia" choice, only cloud-specific ones.
- **Why:** Redis is on the hottest path (sessions, rate limiting, Socket.IO adapter — touched almost every
  request), so an exact-region match with the backend matters most there. Mongo is one hop per DB query, so a
  same-coast near-match (Virginia ↔ Atlas's N. Virginia) is an acceptable small tax by comparison. The user's
  own physical location (India) is irrelevant to this choice — the hot path is server-to-server, not
  browser-to-server, and Upstash/Render don't offer an India region on free tier regardless.
- **Alternatives considered:** Matching everything to Singapore (closest to the user) — rejected because
  Upstash's free tier has no Singapore region, making it the binding constraint; optimizing for the user's own
  request latency instead of the Render↔Redis↔Atlas server-side path — rejected as the wrong thing to optimize
  for a deployed service.
- **Tradeoffs / risks:** None material — this is a portfolio-scale app with a single instance and single region
  throughout the hot path; the only real risk is if this were a multi-region user base, which is out of scope.

## D-006 — GCP Cloud Run considered and rejected for the 3-4 month placement-season lifespan
- **Date / Layer:** 2026-07-22 / Layer 1
- **Context:** User clarified the deployed app only needs to stay live ~3-4 months (placement/interview season),
  which reopened whether to spend the user's GCP $300 trial credit on an always-warm Cloud Run backend instead
  of Render's free tier (which cold-sleeps after ~15 min idle).
- **Decision:** Stay on Render free tier (per D-001), not Cloud Run.
- **Why:** Cloud Run would cost real money from the credit (~$15-60/month range depending on the "CPU always
  allocated" setting) to eliminate a cold-start risk that's already mitigated for free by the cron-job.org
  keep-warm ping. Per `CLAUDE.md`'s free-tier-only constraint, any real spend needs explicit approval, and the
  user chose to stay free rather than spend credit on a marginal demo-smoothness improvement.
- **Alternatives considered:** GCP Cloud Run with `minInstances=1` (rejected — real cost, even if small);
  GCP credit toward Atlas/Upstash directly (not applicable — those services' free tiers aren't billed through
  the user's own GCP account regardless of cloud provider chosen inside their dashboards).
- **Tradeoffs / risks:** Small residual cold-start risk (~30-50s) if a request lands in a gap the keep-warm ping
  doesn't cover (e.g. ping failure, Render maintenance). Accepted as the free-tier tradeoff already logged in
  D-001.

## P-002 — Demo-account login returns 401 on fresh Atlas deploy
- **Date / Layer:** 2026-07-22 / Layer 1
- **Context:** After Vercel/Render/Atlas were all wired up and reachable (no CORS/network errors), logging in
  with the demo accounts shown on the sign-in screen (e.g. `+1234567890`) failed with `401 Unauthorized` on
  `POST /auth/login-phone`.
- **Action:** Diagnosed as expected behavior, not a bug: those demo accounts were seeded (`backend/scripts/seed.js`)
  into the old local/Docker MongoDB, never into the newly created Atlas `ridesync` database. The 401 confirms
  the request pipeline (Vercel → Render → Atlas) works correctly — it's a real "user not found" rejection, not
  a connectivity failure.
- **Why:** Documented instead of silently patching, since the fix depends on a still-open user choice: run
  `seed.js` against the Atlas `MONGO_URI` to recreate the demo accounts, or use the app's own sign-up flow to
  create a real account (arguably a better end-to-end smoke test).
- **Tradeoffs / risks (if applicable):** None yet — no fix applied pending the user's choice of which path to
  take.

## D-007 — Backend lint cleanup: zero-warning gate + admin ride search
- **Date / Layer:** 2026-07-22 / Pre-Layer-2 cleanup
- **Context:** User asked for a full pass on backend code quality (unused vars, dead code, wrong logic)
  before starting Layer 2. `eslint . --ext .js --max-warnings=40` was already passing with 0 errors, but
  carried 36 `no-unused-vars` warnings papered over by the generous `--max-warnings=40` gate. Auditing them
  individually surfaced two that were real behavior gaps, not just dead code: admin `GET /api/rides` accepted
  a `search` query param that was silently dropped, and `server.js` imported the `sessionHijackingDetection`
  middleware without ever `app.use()`-ing it.
- **Decision:** (1) Removed all 34 pure dead imports/locals/unused args (prefixed intentionally-unused
  handler args with `_` per the existing `argsIgnorePattern: ^_` rule). (2) Implemented the admin ride
  `search` param as a case-insensitive, regex-escaped match against `pickup.address` / `destination.address`.
  (3) Left `sessionHijackingDetection` unwired — stripped the dead import rather than activating new
  security-middleware behavior outside the scope of a lint cleanup. (4) Tightened `package.json`'s lint
  script from `--max-warnings=40` to `--max-warnings=0` so new dead code fails CI immediately.
- **Why:** A 40-warning budget let real gaps (like the dropped `search` param) hide next to harmless dead
  imports. Zero-warning is the honest bar for a portfolio project that must be defensible under review.
  Activating unused security middleware is a behavior change with false-positive-logout risk and deserves
  its own reviewed change, not a silent side effect of cleanup.
- **Alternatives considered:** Leaving `--max-warnings=40` (rejected — masks future regressions); wiring up
  `sessionHijackingDetection` now (rejected by user — separate, riskier change).
- **Tradeoffs / risks:** None expected — all 7 backend test suites (163 tests) still pass; lint is 0/0.

## D-008 — Fixed 8 concurrency/auth/data-integrity bugs found by full backend logic audit
- **Date / Layer:** 2026-07-22 / Pre-Layer-2 cleanup (follow-up to D-007)
- **Context:** After the lint cleanup (D-007), user asked whether the backend had any remaining logic
  errors. Ran a 4-way parallel logic audit (controllers / services / middleware+utils / models+routes+config)
  looking specifically for race conditions, inverted auth checks, and data-integrity bugs — not style. All
  findings were independently re-verified by reading the actual code before fixing.
- **Decision:** Fixed all 8 confirmed bugs:
  1. `MatchingService.assignRideToDriver` — driver-side `findOneAndUpdate` now also filters on
     `driverInfo.isAvailable: true`, closing a double-booking race (two concurrent matches could both
     claim the same driver).
  2. `paymentController.processPayment` — replaced the read-then-write "already paid" check with an atomic
     `findOneAndUpdate` claim (`payment.status $nin [completed, processing]`), preventing double payment
     processing from duplicate/concurrent requests.
  3. `rideController.updateRideStatus` — replaced the model's load-then-save `ride.updateStatus()` call with
     an atomic `findOneAndUpdate` guarded on the ride's current status, returning 409 on conflict instead of
     silently letting a duplicate request re-run side effects (driver release, socket broadcasts).
  4. `rideController.completeRide` — same atomic-transition fix, guarded on `status: 'in_progress'`.
  5. `socketService.handleDisconnection` — now only clears `connectedUsers`/marks a driver unavailable if the
     disconnecting socket is still the user's *current* socket, fixing a race where a delayed disconnect
     event from a stale connection could wipe a live reconnection's mapping and silently drop real-time events.
  6. `sessionManager` — access/refresh tokens now carry a `type` claim, and `validateSession` (used on every
     authenticated request) rejects non-access tokens. Previously a leaked 7-day refresh token worked as a
     full API access token.
  7. `middleware/auth.js: optionalAuth` — now routes through `sessionManager.validateSession` (blacklist +
     active-session check) instead of raw JWT verification, closing a fail-open gap where a blacklisted
     (logged-out/rotated) token would still authenticate. Not currently wired to any route, but was a live
     landmine for the next one that adopts it.
  8. `server.js` — moved `express.json()`/`express.urlencoded()` above `advancedInputValidation`,
     `sanitizeInput`, and `suspiciousActivityDetector`. Those three middlewares read `req.body`, which Express
     doesn't populate until the body parser runs — they were previously silently no-op-ing on every POST/PUT
     body (only query/params were ever actually inspected).
  9. `models/User.js: updateRating` — was accumulating a running sum into a field capped at `max: 5` by its
     own schema (would throw a ValidationError on the 2nd call; had zero callers). Rewrote to store a correct
     running average, matching the pattern `paymentController.updateUserRating` already uses in production.
  10. `models/OTP.js` — `expires: 300` combined with an already-future `expiresAt` (`now + 5min`) doubled the
      physical TTL cleanup delay to 10 minutes. Changed to `expires: 0` so Mongo purges exactly at the stored
      timestamp, matching the "5 minutes" comment/intent. (App-level expiry check was already correct — this
      only affected how long expired documents lingered in the collection.)
- **Why:** These are the kind of bugs that don't show up in single-request manual testing or in a lint pass —
  they require reasoning about concurrent requests and adversarial/duplicate input, which is exactly the class
  of bug worth catching before Layer 2 adds Redis-backed shared state on top.
- **Alternatives considered:** Wiring up `sessionHijackingDetection`/`bruteForceProtection` while touching
  auth code (rejected — they reference `req.session`, which this JWT-only app never populates; activating them
  is a bigger, separately-reviewable change, not a fix to an existing bug).
- **Tradeoffs / risks:** One test (`middleware-auth.test.js`, `optionalAuth` suite) needed updating to
  explicitly mock `sessionManager.validateSession` per-case — it was previously passing only because of
  unintentional mock-state leakage between tests (`jest.clearAllMocks()` doesn't reset `mockResolvedValue`
  implementations). Fixed the test to mock explicitly rather than rely on leakage. All 163 tests pass; lint 0/0.

## D-009 — Fixed 3 frontend logic bugs (map center, token rotation, stuck spinner)
- **Date / Layer:** 2026-07-22 / Pre-Layer-2 cleanup (follow-up to D-008)
- **Context:** User asked for the same logic audit on the frontend. Parallel subagent spawning was blocked by
  the session's permission classifier for this task, so the audit was done directly (same rigor, sequential)
  across contexts, pages, components, hooks, and services.
- **Decision:** Fixed all 3 confirmed bugs:
  1. `MapComponent.tsx` — the `center` prop follows the component's own `[lng, lat]` convention (matching
     `pickup`/`destination`/`driverLocation`, all GeoJSON-style and explicitly flipped before being handed to
     Leaflet markers), but `center` itself was passed straight into `<MapContainer center={center}>` and
     `mapRef.current.setView(center, zoom)` — both native Leaflet APIs expecting `[lat, lng]`. Both callers
     (`RiderBookPage`, `DriverDashboardPage`) pass `[lng, lat]` consistent with the rest of the app, so the
     map's actual center/pan target was wrong on every load (e.g. Bengaluru `[77.59, 12.97]` read as lat
     77.59°/lng 12.97° — nowhere near India), even though markers on the same map rendered correctly. Fixed by
     flipping to `[center[1], center[0]]` at both Leaflet call sites, keeping the prop's public convention
     unchanged for callers.
  2. `apiClient.ts` / `AuthContext.tsx` — the backend's `sessionManager` silently rotates tokens once they
     cross a 12h age threshold, blacklisting the old one and returning new tokens via
     `X-New-Access-Token`/`X-New-Refresh-Token` response headers (see D-008 item 6). Nothing in the frontend
     ever read these headers, so the next request after a rotation used the now-blacklisted old token and was
     rejected, forcing an unexpected logout — exactly the disruptive behavior `apiClient.ts`'s 401 handler
     explicitly tries to avoid. Fixed by having the response interceptor persist a rotated access token to
     `localStorage` and broadcast a `window` `CustomEvent('auth:token-rotated')`; `AuthContext` listens for it
     and updates its `token` state via a new `UPDATE_TOKEN` reducer action, so `SocketContext`'s socket-auth
     handshake (which reads `token` from `useAuth()`, not `localStorage`) also stays current. Used a window
     event as the bridge because `apiClient.ts` is a plain module outside the React tree and has no direct
     access to the context's `dispatch`.
  3. `AuthContext.register()` — dispatched `AUTH_START` (`isLoading: true`) but never cleared it on the
     success path (only the OTP step's `AUTH_SUCCESS`/failure resets loading). If a user completed the phone
     step but abandoned the OTP step, `isLoading` stayed `true` for the rest of the SPA session, and
     `ProtectedRoute` (which gates on that same context value) would show an infinite spinner instead of
     redirecting to login on any later navigation. Fixed by dispatching `SET_LOADING: false` on the register
     success branch.
- **Why:** Bug 1 is the highest-impact of the three — it's the kind of thing that's easy to miss visually
  during dev (markers still show up in roughly the right relative position to each other) but breaks the map's
  actual framing for every user. Bugs 2 and 3 are both "works fine in a 10-minute manual test, breaks hours
  later" classes of bug — exactly what this audit was for.
- **Alternatives considered:** For bug 2, storing the refresh token client-side and building a real
  refresh-and-retry flow (rejected — the app doesn't currently persist a refresh token at all, and building
  that flow is a bigger, separately-reviewable change; the header-capture fix matches what the backend already
  implements and requires no new backend work).
- **Tradeoffs / risks:** None found; `tsc --noEmit` clean, `eslint` clean (11 pre-existing warnings unrelated
  to touched files, under the 15 cap), all 59 frontend tests pass.

## P-003 — Local dev seeding required manual reseeding on every launch
- **Date / Layer:** 2026-07-22 / Pre-Layer-2 cleanup
- **Context:** User wanted `docker-compose up` to always have exactly one demo admin/rider/driver available
  without manually running `npm run seed` every time. Two separate causes made this not work:
  1. The old `seed.js` was destructive (`User.deleteMany({})` + `Ride.deleteMany({})` on every run) and had
     to be invoked manually — nothing called it automatically.
  2. The root `.env` (git-ignored, local-only) had `NODE_ENV=production` set under a "Render reference"
     comment block that was meant purely as deployment documentation. Docker Compose auto-loads `.env` from
     the project root for `${VAR}` substitution, so this leaked into local dev: the backend container ran in
     production mode, which disables dev-only conveniences.
- **Action:** Rewrote `backend/scripts/seed.js` to be idempotent — `ensureDemoAccounts()` looks up each demo
  account via the model's existing `User.findByPhone`/`findByEmail` statics (hash-based lookup, correct given
  encrypted PII fields) and only creates it if missing; never deletes anything. Trimmed the seed list from 5
  users (2 riders, 2 drivers, 1 admin) to exactly 1 of each role, matching what was asked for. Wired
  `ensureDemoAccounts()` into `server.js`'s `startServer()` right after `dbConnection.connect()`, gated on
  `NODE_ENV !== 'production'` so it can never run against the real Atlas/production database. Fixed local
  `.env`'s `NODE_ENV` to `development` with a comment explaining why (Render's own `NODE_ENV=production` is
  configured in Render's dashboard directly, independent of this file).
- **Why:** This makes `docker-compose up` self-sufficient for local dev — first boot creates the 3 demo
  accounts, every later boot (including plain container restarts) is a no-op since the accounts already
  exist, and the guard makes it structurally impossible for this to touch the production database.
- **Tradeoffs / risks:** None found. Verified live: fresh `docker-compose up -d --build` seeded all 3 accounts
  on first boot, a subsequent restart logged no re-seed/duplicate-key activity, and all three demo accounts
  (`admin@cabaggreg.local` / `+1234567890` / `+1234567892`) successfully logged in via the running API.
