# Code Tour — reading order, traces, and drill questions

This is not another summary of what RideSync claims (that's `ProjectInfo-RideSync.md` and
`README.md`). This is a map of **where in the code each claim actually lives**, so you can open the
file, point at the line, and explain it under questioning. Every `file:line` below was read directly
off the current code while writing this doc — if a line has since moved, the surrounding function
name will still get you there fast.

How to use this: read the files in order (§1), then rehearse the five traces (§2) out loud without
looking, then drill yourself on §3. §4 is the numbers you're allowed to say in an interview.

---

## 1. Reading order (~20 files, do this first)

Skip `frontend/dist/`, `backend/coverage/`, `backend/routes/test-error-handling.js`, the admin CRUD
bulk of `userController.js`, and most of `securityValidator.js`/`securityLogger.js` — none of that
is where the interesting decisions live.

**Entry / wiring** (read `server.js` fully — it's the map of everything else)
1. `backend/server.js` — Express app assembly, middleware order, route mounting, startup sequence.
2. `backend/config/redis.js` — the shared Redis client, or `null` if unset.
3. `backend/config/metrics.js` — the 3 custom Prometheus metrics.

**Data model**
4. `backend/models/User.js` — PII fields, encryption hooks, the 2dsphere index.
5. `backend/models/Ride.js` — ride lifecycle/status fields.
6. `backend/models/OTP.js` — TTL-indexed OTP documents.

**Core logic — this is the interview meat**
7. `backend/services/MatchingService.js` — geospatial matching + atomic driver assignment.
8. `backend/services/FareService.js` — surge fare formula.
9. `backend/services/GracefulDegradationService.js` — circuit breaker + fallbacks.
10. `backend/utils/sessionManager.js` — JWT session lifecycle, rotation, blacklist.
11. `backend/utils/encryption.js` — AES-256-GCM field encryption (and the P-007 bug's exact line).
12. `backend/utils/loginLockout.js` — IP+account-scoped brute-force lockout.

**Request path**
13. `backend/middleware/auth.js` — `requireAuth`/`optionalAuth`, where `req.user` gets attached.
14. `backend/config/security.js` + `backend/middleware/security.js` — rate limiter definitions (read
    both — they disagree, which is one of the drill questions below).
15. `backend/routes/rides.js` — the full middleware chain per route, good for seeing auth/rate-limit
    ordering at a glance.
16. `backend/controllers/rideController.js` — skim; read only `bookRide` (line 17) in full, the rest
    on demand via the traces below.

**Realtime**
17. `backend/services/socketService.js` — connection auth, room join/leave, disconnect grace period.
18. `backend/services/socketHandlers.js` — pure broadcast helper functions (no state).

**Observability**
19. `backend/utils/requestContext.js` — the whole correlation-ID mechanism, 18 lines.
20. `backend/middleware/metrics.js` — where `httpRequestDuration` gets observed per request.

**Frontend (thin pass — don't over-invest here)**
21. `frontend/src/services/apiClient.ts`, `frontend/src/contexts/AuthContext.tsx`,
    `frontend/src/contexts/SocketContext.tsx`. Enough to answer "how does the frontend know it's
    logged in / connected" — not line-level territory.

---

## 2. Five end-to-end traces (rehearse these out loud)

### A. Login → JWT → session
1. `routes/auth.js:46` `POST /login-email` → `authController.js:380 loginEmail`.
2. `authController.js:398` — `User.findByEmail(email)` looks up by **`email_hash`** (deterministic
   SHA-256), not a query against the encrypted `email` field — ciphertext has a random IV so it can
   never match itself twice (see drill Q9 / P-019).
3. `authController.js:439` — `loginLockout.isLocked(req.ip, email)` — **before** password check.
4. `authController.js:458` — `user.comparePassword` (bcrypt, `models/User.js:303`).
5. On failure: `authController.js:460` → `loginLockout.js:30 recordFailedLogin` — keyed on
   `login_lockout:{ip}:{sha256(email)}` (`loginLockout.js:24-28`), TTL re-armed to a full window only
   once the 5th attempt actually lands (`loginLockout.js:37-42`).
6. On success → `sessionManager.js:35 createSession` — generates access (`:256`, 24h) + refresh
   (`:269`, 7d) JWTs, each carrying `type: 'access'|'refresh'`, stores a hashed-token session record
   in Redis (or the in-memory `Map` fallback) via `_putSession` (`:353`).
7. **Verify side, every subsequent request:** `middleware/auth.js:15 authenticateToken` →
   `sessionManager.js:86 validateSession` → blacklist check (`:88`) → `jwt.verify` (`:92`) → **reject
   if `decoded.type !== 'access'`** (`:95` — this is what stops a leaked refresh token from working as
   an API token, D-008 item 6) → session lookup + 24h idle timeout (`:106`) → if token age >12h,
   silent rotation (`:115-134`, new tokens returned via `X-New-Access-Token` header,
   `middleware/auth.js:120`).

### B. Book a ride → geospatial match → atomic assign
1. `routes/rides.js:50` — chain is `requireAuth → requireRider → rideBookingRateLimiter (5/min,
   keyed per-user not per-IP, `security.js:174-178`) → validateRideBooking → bookRide`.
2. `rideController.js:17 bookRide` — validates coordinates (`:31`), rejects if the rider already has
   an active ride (`:44-47`, one Mongo query, not a transaction — see drill Q7), computes distance/
   duration itself (Haversine helpers further down the same file — **not** `MatchingService`'s copy,
   see drill Q8), calls `FareService.calculateFare` (`:72`), then `ride.save()` (`:88`).
3. **Response returns here** — matching is fired via `setTimeout` (`:94`, fire-and-forget, not
   awaited), so the HTTP response doesn't wait for a driver to be found.
4. `MatchingService.js:37 findNearestDriver` → `:70` loop over `RADIUS_EXPANSION_STEPS = [5000,
   10000, 15000]` (`:24`) → `_findAvailableDriversInRadius` (`:332`) issues the actual `$near` +
   `$maxDistance` query against the `driverInfo.currentLocation` 2dsphere index
   (`models/User.js:266`) → results re-sorted by `_calculateDistance` (`:379`, Haversine, R=6371km)
   because `$near` already returns nearest-first but the code re-derives distance for the ETA display
   too (`_estimateArrivalTime`, `:402`, 25 km/h assumed city speed).
5. `assignRideToDriver` (`:165`) — **the double-booking race fix (D-008 #1):** the ride claim
   (`:168-183`) is a single conditional `findOneAndUpdate({_id, status:'requested', driverId:null},
   ...)` — atomic, not read-then-write. The driver claim (`:195-210`) is the same pattern, filtered on
   `driverInfo.isAvailable: true`. If the ride claim succeeds but the driver claim fails (someone else
   grabbed that driver first), it's rolled back (`:213-218`) and the next-nearest candidate is tried
   (`_findNearestDriver`, the fallback loop at `:119-131`).

### C. Realtime event, and why it survives 2 backend instances
1. `SocketContext.tsx:37` — client connects with `auth: { token }`.
2. `socketService.js:27` — `io.use()` auth middleware: extract token from handshake, `jwt.verify`
   (not `sessionManager.validateSession` — this path does **not** check the blacklist, worth knowing
   as a limitation), fetch user, reject if `!user.isActive` (`:41`).
3. `socketService.js:99` `ride:join-room` → `handleJoinRideRoom` (`:137`) → authorization check
   (`:156-159`, rider/driver/admin on that ride) → `socket.join('ride:'+rideId)`.
4. A status change reaches `socketHandlers.js:142 broadcastRideStatus` → `:95
   broadcastRideNotification` → `io.to(roomName).emit(...)`.
5. **The scalability step:** `server.js:53-63` — if `REDIS_URL` is set, `io.adapter(createAdapter(...))`
   wraps that `io.to().emit()` in Redis pub/sub, so a room emit issued on instance A is published to
   Redis and every instance subscribed (including B) delivers it to its own locally-connected sockets.
   No adapter → Socket.IO's built-in in-memory adapter → single process only.
6. Disconnect handling (`socketService.js:418`) is not instant for drivers: a stale-socket guard
   (`:426`, ignores a disconnect event if the user has already reconnected on a newer socket id) plus
   a 30s grace timer (`presence.driverDisconnectGraceMs`, `config/security.js:34`) before actually
   flipping `driverInfo.isAvailable: false` — a network blip doesn't strand a driver as unavailable.

### D. External call fails → breaker opens → fallback serves
1. Call site wraps the risky operation: `gracefulDegradation.getMapsData(operation, coords)` (or
   `sendSMS`/`processPayment`/`geocodeAddress`), each a one-line passthrough to its own
   `CircuitBreaker.execute` (`GracefulDegradationService.js:105-140`).
2. `CircuitBreaker.execute` (`:22`) — if `state === 'OPEN'` and `resetTimeout` hasn't elapsed, skip
   straight to the fallback (`:28-29`); otherwise race the real operation against a per-service
   timeout (`:34-39`).
3. On failure: `failureCount++` (`:50`), and at `failureCount >= threshold` (`:55`) state flips to
   `OPEN`. Per-service tuning (`:94-99`): maps 3 failures/5s timeout/30s reset, sms 3/10s/60s,
   payment 2/15s/120s, geocoding 3/8s/45s — payment gets the lowest failure threshold because a false
   trip there is the most expensive to get wrong.
4. Fallback runs (`:60-64` or the `OPEN`-state short-circuit) — e.g. `getOpenStreetMapFallback`
   (`:145`) or `getGeocodingFallback` (`:228`, a hardcoded city-name→coordinate table, defaults to
   Bengaluru).
5. `config/metrics.js:31-42` — the `circuit_breaker_state` gauge is **pull-based**: on every `/metrics`
   scrape it reads `gracefulDegradation.getHealthStatus()` live rather than the breaker pushing state
   changes anywhere. `HALF_OPEN` (`:23-26` transition) is a single-request transient — the very next
   line either closes it or re-opens it, so it's rarely caught by an external scrape (this is called
   out explicitly in `load/README.md`'s honesty section).

### E. PII in → encrypted at rest → decrypted out
1. `models/User.js:412` — `pre('save')` hook: for each field in `PII_FIELDS` (`:403-409`:
   `phone`, `email`, `profile.name`, `driverInfo.licenseNumber`,
   `driverInfo.vehicleDetails.plateNumber`), **hash first** (`:414-419`, plaintext →
   `phone_hash`/`email_hash`, so lookups stay possible), **then encrypt** (`:421-431`).
2. `encryption.js:49 encrypt` — random 16-byte IV per call (`:56`), AES-256-GCM, derived key via
   PBKDF2 (100,000 iterations, static salt, `:39-41`) — the random IV means **the same plaintext
   never produces the same ciphertext twice**. This is why `getAllUsers`'s admin search can't
   `$regex` the DB (P-019 below) and why lookups go through the deterministic `*_hash` fields instead.
3. **The P-007 bug lived here:** `encryption.js:185 setNestedValue` — `PII_FIELDS.forEach` calls this
   to write the encrypted value back onto the Mongoose document at a nested path
   (e.g. `'profile.name'`). A plain `target[lastKey] = value` bracket assignment mutates the document
   in memory and even makes `isModified()` return `true`, but Mongoose silently drops it when
   building the actual `.save()` update for a **nested** path — only `.set(path, value)` reliably
   registers the change. Fix: `:193` checks `typeof obj.set === 'function'` and uses `.set()` for
   Mongoose documents, falling back to bracket assignment for plain objects (this same util also runs
   on non-Mongoose data via `encryptFields`/`decryptFields`).
4. Read side: `models/User.js:437` `post(['find','findOne','findOneAndUpdate'])` and `:469`
   `post('init')` both independently decrypt `PII_FIELDS` back to plaintext (harmless overlap — the
   second call just tries to decrypt already-plaintext data, fails inside a try/catch, keeps it as-is).
5. **The `findByIdAndUpdate` bypass class of bug (P-019):** any write path that isn't `.save()` skips
   the `pre('save')` hook entirely. `userController.updateProfile`/`updateDriverProfile` used to call
   `User.findByIdAndUpdate` directly — PII fields got written back as **plaintext**, with no error,
   because the decrypt hooks' try/catch silently treats already-plaintext data as "decryption failed,
   keep as-is." Fixed by converting both to fetch-then-`.save()` (matches the pattern
   `updateLocation`/`suspendUser` already used). Good drill question: name the other
   `findByIdAndUpdate` call on `User` that's fine to leave as-is (`socketService.js:263` and `:387` —
   they only touch `driverInfo.currentLocation`/`isAvailable`, non-PII).

---

## 3. Drill questions

Answer each without looking, then check the file. Categories roughly escalate design → show-me →
tradeoffs → bug stories.

**Design**
1. Why MongoDB `2dsphere` + `$near` instead of a Redis geo set for driver matching? *(Drivers are
   already the durable Mongo record via `User.driverInfo`; adding a second geo store means keeping
   two systems in sync on every location update — `$near` gets you an indexed nearest-neighbor query
   for free on data you already have.)*
2. Why expanding radius (5→10→15km) instead of one fixed search radius? *(Low-density areas would
   return zero drivers on a fixed small radius; a single large radius means every search — even in a
   dense area — pays the cost of scanning a huge geo range. `MatchingService.js:70`.)*
3. The DB `$near` query already returns nearest-first — why does the code re-sort by
   `_calculateDistance` afterward? *(`$near` sorts by distance but the code needs the actual numeric
   distance for the ETA calculation anyway, so it recomputes and sorts on that same value —
   `MatchingService.js:85-102`.)*
4. Why Redis for sessions/rate-limits instead of sticky sessions at the load balancer? *(Sticky
   sessions tie a user to one instance — a crash or scale-down drops their session. Shared Redis state
   means any instance can serve any request. Render's free tier only runs one instance today, so this
   is provable architecture, not a live multi-instance proof — see README's honest caveats.)*
5. Why does each circuit breaker have a different threshold/timeout (`GracefulDegradationService.js:94-99`)?
   *(Tuned per the cost of a false trip vs. a false miss: payment gets the lowest failure threshold (2)
   because a bad trip there blocks real money movement; SMS gets the longest reset (60s) because a
   delayed OTP is a minor annoyance, not a broken core flow.)*

**"Show me"**
6. Where exactly was the double-booking race, and what makes the fix atomic, not just "faster"?
   *(`MatchingService.js:168-183` — a single `findOneAndUpdate` with the availability condition baked
   into the filter, so the DB rejects the update entirely if another request already changed
   `driverId`/`status` — no window between a read and a write for two requests to interleave.)*
7. `bookRide` checks "does this rider have an active ride" with a plain `findOne`, not the atomic
   pattern used for driver assignment — is that a bug? *(Arguably yes under true concurrency — two
   simultaneous book requests from the same rider could both pass the check. Lower severity than the
   driver race because it's the same user racing themselves, not two different riders colliding.)*
8. Trace where the blacklist is actually checked on a request. *(`sessionManager.js:88`, inside
   `validateSession`, called from `middleware/auth.js:38` on every `requireAuth`-protected route.)*
9. Where is the correlation ID attached to a response, and what powers it end-to-end?
   *(`requestLogger.js:17-19` — reuse an incoming `X-Request-ID` header or generate one, `:20` sets
   it on the response, `:56` calls `requestContext.run(requestId, next)`, wrapping the rest of the
   request in `AsyncLocalStorage` (`requestContext.js`, 18 lines total) so every log line in that
   request can read the same ID without threading it through every function signature.)*
10. Two files define rate-limit numbers for `auth` — `config/security.js:40-44` (15min window, max 5)
    and `middleware/security.js:136-141` (5min window, max 20). Which one is actually live, and how do
    you know? *(`middleware/security.js`'s `strictAuthRateLimiter` — it passes its own literal
    `windowMs`/`max` into `createAdvancedRateLimiter`, overriding whatever `config/security.js`
    exports. Confirmed by grep: `config/security.js`'s `rateLimiting` object is only ever imported by
    `securityValidator.js`, never by `middleware/security.js`. `README.md`'s "auth 20/5min" claim
    matches the live one.)*
11. Where does the in-memory fallback kick in when `REDIS_URL` is unset? *(Every Redis-backed module
    checks `if (this.redis)` / `if (redisClient)` at each storage call —
    `sessionManager.js:353-427`, `loginLockout.js:35/58/69`, `redisRateLimitStore.js` — and falls back
    to a `Map`/in-process counter. `config/redis.js` exports `null` when the env var is unset, which is
    the single switch every consumer checks.)*

**Tradeoffs / attacks on the project**
12. Breaker state lives on the singleton `GracefulDegradationService` instance
    (`module.exports = new GracefulDegradationService()`, `:309`) — what breaks with 10 Render
    instances? *(Each instance has its own breaker state; one instance seeing 3 maps-API failures
    opens its own breaker but the other 9 keep hammering the failing service. No shared breaker state
    across a fleet — stated explicitly in the README's honest caveats.)*
13. `ENCRYPTION_KEY` has no rotation — what does that mean operationally if it leaks?
    *(Every PII field ever encrypted under that key is compromised; there's no re-encryption/versioning
    scheme, so recovery means generating a new key and re-encrypting every record — no tooling exists
    for that today beyond the one-off `reencrypt-demo-accounts.js` script.)*
14. Backend statement coverage is ~32% on a 184-test suite — why isn't that damning? *(Coverage is
    concentrated on the logic that actually matters — auth, fare, matching, lockout — not spread thin
    for a number. Lead with test *counts and what they exercise*, not the coverage percentage.)*
15. Load-test numbers are all local against real Atlas+Upstash, not the live Render deploy — why?
    *(`/api/test/*` fault-injection routes only mount when `NODE_ENV=development`; Render runs
    production. Free-tier caps — Upstash 500K commands/mo, Atlas 10GB/7-day — make a sustained ramp
    against the live deploy both risky to the account and not representative of the app's own
    performance. `load/README.md`'s "Known limitations" section.)*
16. What's the actual single point of failure in the deployed (not architecture) state?
    *(One Render instance — no horizontal scaling live, despite the app being built to support it.
    Also: security audit logs write to local disk, wiped on every Render cold start, so they're not
    durable in production today.)*

**"Hard bug" stories — tell each as symptom → root cause → fix → verification, ~4 lines each**
17. **P-006** — Redis TLS scheme bug. Symptom: every `/api/*` call hung/failed in production, no
    Render incident reported. Five code-level hypotheses were tried and each fixed something real
    (stale-connection pacing, a `withRedisTimeout` wrapper, replacing `rate-limit-redis`'s retry-loop-
    defeating-timeouts internals) but none fixed the actual outage. Root cause, found by diffing
    Render's env vars against a known-working local `.env`: Render's `REDIS_URL` used `redis://`
    (plaintext) instead of `rediss://` (TLS) — Upstash's endpoint expects TLS, so every connection
    got `ECONNRESET` right after the TCP-level `connect` event fired (which is why logs looked
    healthy). Fixed by correcting the env var. Verified live: clean deploy log, real login succeeded.
18. **P-007** — silent PII-encryption no-op. Symptom: none — discovered while chasing a cosmetic log
    warning. Root cause: `encryption.js`'s `setNestedValue` used bracket assignment on a Mongoose
    document for a nested path, which Mongoose's `.save()` silently ignores (only `.set()` persists
    nested-path mutations). Every PII field had been saving as plaintext since the feature was
    written, despite the encrypt hook visibly "running." Fix: use `.set()` when available. Verified by
    reading raw bytes via the **native Mongo driver**, bypassing Mongoose's own decrypt hooks, which
    had been masking the bug the whole time.
19. **P-008/P-009** — dead brute-force protection, then a live IP-spoofing gap. First: found
    `bruteForceProtection` middleware existed but referenced `req.session`, which this JWT-only app
    never populates — it never ran. Replaced with real Redis-backed IP+account-scoped lockout
    (`loginLockout.js`). Then live-tested it: locked out on phone, tried the correct password on
    laptop, still got `423`. Render's proxy meant `req.ip` was always `::1` for every request (no
    `trust proxy` set) — the IP-scoping had silently collapsed back to pure account-scoping, the exact
    flaw it was built to fix. Fixed with `app.set('trust proxy', 1)` (`server.js:36`).
20. **P-019** — profile edits bypassing encryption + dead admin search. Two independent symptoms
    traced to one root cause class: `findByIdAndUpdate` skips `pre('save')`. Profile edits wrote PII
    as plaintext with no error (decrypt hooks fail closed to "keep original value"). Admin search
    regex'd the encrypted field directly — impossible to match since every encryption uses a fresh
    random IV. Fixed both: profile edits converted to fetch-then-`.save()`; search converted to
    fetch-then-decrypt-then-filter-in-memory (documented as a `ponytail:`-tagged scale ceiling — fine
    for 3 demo accounts, would need a real search index at real scale).

---

## 4. Numbers you're allowed to say out loud

Every figure here traces to `ProjectInfo-RideSync.md` §6, `load/README.md`, or a config file read
directly. Don't round up, don't invent anything not in this table.

| Claim | Number | Source |
|---|---|---|
| REST throughput | 100 req/s sustained, p95 = 3.72ms, 0% errors, 7,725 requests | `load/README.md` |
| Fare estimate latency | p95 = 216.54ms, 0% errors (rate-capped by design) | `load/README.md` |
| Concurrent WebSocket hold | 200/200 held 20s, 0 dropped | `load/README.md` |
| Circuit breaker trip | `maps` CLOSED→OPEN, 3 failures = threshold, <1s | `load/README.md` |
| Backend tests | 184/184 passing, 14 suites | `README.md` (re-verified 2026-08-02) |
| Frontend tests | 59/59 passing | `README.md` |
| Backend coverage | ~32% statement, concentrated on core logic | `ProjectInfo-RideSync.md` §8 |
| Matching radius steps | 5km → 10km → 15km | `MatchingService.js:24` |
| Max drivers considered per search | 10 | `MatchingService.js:25` |
| Fare formula | ₹50 base + ₹12/km + ₹2/min, min ₹75, max ₹5000 | `FareService.js:20-25` |
| Surge tiers | low ×1.0, medium ×1.5, high ×2.0, peak ×2.5 | `FareService.js:29-34` |
| Driver share of fare | 80% | `FareService.js:26` |
| Breaker thresholds | maps 3/5s/30s, sms 3/10s/60s, payment 2/15s/120s, geocoding 3/8s/45s | `GracefulDegradationService.js:94-99` |
| Session lifetime / rotation | 24h access token idle timeout, rotates after 12h | `sessionManager.js:25-26` |
| Refresh token lifetime | 7 days | `sessionManager.js:270` |
| Max concurrent sessions/user | 5 | `sessionManager.js:24` |
| Login lockout | 5 failed attempts, 15 min window, IP+account scoped | `config/security.js:16-17`, `loginLockout.js` |
| Live rate limits | auth 20/5min, OTP 3/5min, API 100/15min, ride-booking 5/min | `middleware/security.js:136-179` |
| PBKDF2 iterations (key derivation) | 100,000 | `encryption.js:41` |
| Driver disconnect grace period | 30s | `config/security.js:34` |

---

## After the tour

Once you can rehearse traces A–E and answer ~16/20 of the drill questions unaided, you're ready for a
mock interview pass. Whatever you can't answer gets folded back into this file as a new drill
question with its own anchor.
