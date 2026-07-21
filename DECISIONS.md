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
