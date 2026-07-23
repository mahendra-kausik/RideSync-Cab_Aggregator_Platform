# Layer 3 — Load testing

Three scenarios, run locally against `node server.js` with `NODE_ENV=development`
(see `DECISIONS.md` for why local, not the live Render deploy). Zero backend
runtime code changes — every script hits existing public/dev-only endpoints.

| Scenario | Tool | Target | Measures |
|---|---|---|---|
| `rest-ramp.js` | k6 | `GET /health`, `POST /api/rides/estimate` | req/s, p95 latency, error rate |
| `ws-hold.js` | Node + `socket.io-client` | Socket.IO handshake (`socketService.js`) | max stable concurrent WS connections |
| `breaker-trip.js` | Node (fetch) | `GET /api/test/external-service-test`, `GET /health` | circuit-breaker CLOSED→OPEN→HALF_OPEN |

## Reproduce

```bash
# terminal 1 — backend in dev mode (enables /api/test/*)
cd backend && NODE_ENV=development npm start

# terminal 2
cd load && npm install
npm run rest                       # k6 REST ramp, ~2m45s
BASE_URL=http://localhost:5000 node ws-hold.js 200 30   # 200 sockets, 30s hold
node breaker-trip.js                                    # ~35s
```

`rest-ramp.js` also accepts `BASE_URL` (default `http://localhost:5000`) and
exports a JSON summary via `k6 run --summary-export=results/rest-ramp.json rest-ramp.js`.

## Results

**Run config:** commit `20c6d38` · Node `v24.4.1` · k6 `v2.1.0` · host `12th Gen Intel Core i5-1235U, 16GB RAM, Windows 11` · backend against real Atlas M0 + Upstash Redis (not local Docker) · 2026-07-23

### REST ramp (`rest-ramp.js`)
Two scenarios in one run — `health_ramp` (ramping 5→100 req/s over ~2m45s) and
`estimate_capped` (fixed 4 req/min, see "Known limitations" below for why).

| Metric | `GET /health` | `POST /api/rides/estimate` |
|---|---|---|
| Peak arrival rate | 100 req/s | 4 req/min (capped by design) |
| Total requests | 7,725 | 12 |
| p95 latency | 3.72ms | 216.54ms |
| Error rate | 0.00% | 0.00% |

Full JSON summary: `results/rest-ramp.json`.

### WebSocket hold (`ws-hold.js`)
| Metric | Value |
|---|---|
| Concurrency attempted | 200 |
| Handshake failures | 0 |
| Stable connections after 20s hold | 200 (0 dropped) |

### Circuit breaker trip (`breaker-trip.js`)
| Transition | Observed |
|---|---|
| CLOSED → OPEN | Yes — 3 injected failures tripped `maps` (threshold 3) in <1s |
| OPEN → HALF_OPEN | Not externally observable — see limitation below |

Full timeline: `results/breaker-trip.txt`.

## Known limitations (honesty guardrails)

- **`/api/rides/estimate` is intentionally not ramped.** Two independent gates sit in
  front of every `/api/*` route beyond the named per-route limiters: `apiRateLimiter`
  (100 req/15min per IP+User-Agent, Redis-backed so it survives a server restart —
  `backend/middleware/security.js:155`) and `apiAbuseDetection` (100 req/min,
  in-memory, self-perpetuating once tripped — `backend/middleware/
  advancedSecurity.js:305`). A ramp against `/estimate` just measures 429s past
  ~100 requests. `GET /health` is mounted directly on `app`, outside `/api`, so it's
  exempt from both — it carries the throughput numbers; `/estimate` runs at a fixed
  low rate to report real business-logic (fare calculation) latency instead. See D-012.
- **Local, not live:** `/api/test/*` only mounts when `NODE_ENV=development`
  (`backend/server.js`); Render's production deploy runs `NODE_ENV=production`,
  so fault injection and these exact numbers only reproduce locally. Free-tier
  caps (Upstash 500K commands/month, Atlas 10GB/7-day window, Render's
  throttled shared CPU) made sustained runs against the live deploy both
  risky and not representative of the application's own performance anyway.
- **HALF_OPEN is a single-request transient state:** the test endpoint always
  injects a failure, so on the first post-reset-timeout request the breaker
  flips CLOSED-path logic to `HALF_OPEN` then immediately back to `OPEN`
  within the same request — there's no real window where a concurrent
  `/health` poll is guaranteed to observe `HALF_OPEN`. `breaker-trip.js`
  polls every 2s during the reset window and reports whatever it actually
  saw rather than asserting a guaranteed catch.
- **WS hold reuses one demo account's token** across all concurrent sockets
  to measure raw connection capacity; it is not a per-user fan-out test.
