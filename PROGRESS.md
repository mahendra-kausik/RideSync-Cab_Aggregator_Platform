# PROGRESS.md — Running State

> **Read first at session start; update at the end of every layer. Keep it short.**
> This is the resume doc — the *what shipped* index. Full rationale for every choice
> lives in `DECISIONS.md`; headline numbers + architecture live in `README.md`.

## Current status
**Layer 0 shipped. Layer 1 (deploy to public URL) in progress — two pre-deploy code fixes done; hosted-account
setup (Render/Vercel/Atlas/Upstash/cron) still pending, needs the user.**
- **Not yet deployed** — app currently runs only via Docker Compose. Public URL is the Layer 1 deliverable.
- **Baseline being upgraded:** working MERN cab-aggregator, 578 backend tests (~72% coverage), real-time
  Socket.IO, geospatial matching, AES-256-GCM PII encryption, circuit-breaker graceful degradation.

## Layer checklist
- [x] **Layer 0 — Retarget operating docs** (CLAUDE.md, PROJECT_PLAN.md, PROGRESS.md, DECISIONS.md rewritten
      from the previous DocsGPT project to RideSync; working-protocol instructions preserved).
- [ ] **Layer 1 — Deploy to a public URL** ← IN PROGRESS
      - [x] Fixed `MapComponent.tsx` pre-deploy crash risk (broken Mapbox-token logic → OSM-only); verified via `npm run build`.
      - [x] Deleted dead/unused `calculateFare` duplicate in `rideController.js` (was never called — not a live bug); verified via `services-fare.test.js` + `rides-api.test.js` (51/51 pass).
      - [ ] Atlas M0 cluster + `scripts/ensure-indexes.js`.
      - [ ] Render Web Service (backend) + Vercel (frontend) + real prod secrets + CORS.
      - [ ] cron-job.org keep-warm ping.
      - [ ] Wire the real Render deploy hook into `.github/workflows/ci-cd.yml`.
- [ ] Layer 2 — Redis shared-state layer (sessions + rate limit + Socket.IO adapter; in-memory fallback).
- [ ] Layer 3 — Load testing with k6 (req/s, p95, concurrent WS, circuit-breaker trip).
- [ ] Layer 4 — Observability (prom-client /metrics + Grafana Cloud + correlation IDs).
- [ ] Layer 5 — README-as-paper & resume bullets.

## Deployed system — quick reference (fill in as layers ship)
- **Live UI:** _(pending Layer 1 — Vercel)_
- **Live API:** _(pending Layer 1 — Render, `/health`, `/api/*`)_
- **Stack:** React + TS + Vite (frontend) · Node + Express + Socket.IO (backend) · MongoDB Atlas M0 · Upstash Redis.
- **Repo:** `origin` = https://github.com/mahendra-kausik/RideSync-Cab_Aggregator_Platform.git.
  Commits authored by user only (no Claude co-author).
- **Env:** Windows 11 / PowerShell. Backend start: `node server.js` (`npm start`); dev: `nodemon` (`npm run dev`).
  Local full stack: `docker-compose up`. Tests: `npm test` (backend Jest), frontend Vitest.
- **Code fixes done this session:** `MapComponent.tsx` crash-risk fix + dead `calculateFare` deletion (see
  checklist above) — both verified, no regressions.
- **Remaining Layer 1 code work:** index audit → `scripts/ensure-indexes.js`.

## Open items
- **Needs the user** — hosted account creation Claude cannot do: Render Web Service, Vercel project, MongoDB
  Atlas M0 cluster, Upstash Redis instance, cron-job.org keep-warm schedule. Claude will prepare configs/scripts
  and hand over an exact checklist.
- All Layer 1 hosting free-tier limits still to be verified live (see PROJECT_PLAN §8).
- Real prod secrets to generate before first deploy: 32-byte `ENCRYPTION_KEY`, strong `JWT_SECRET`
  (the `SecurityValidator` prod gate will reject weak/placeholder values).

## Decisions log (one-line index — full entries in `DECISIONS.md`)
- D-001 — Hosting = Render + Vercel + Atlas M0 + Upstash Redis (free, no card, native WebSocket).
- D-002 — Redis for shared state (sessions + rate limit + sockets) with in-memory fallback.
- D-003 — `@socket.io/redis-adapter` over sticky sessions for cross-instance socket delivery.

## How to resume
1. Read this file, then `CLAUDE.md`, then the relevant section of `PROJECT_PLAN.md`.
2. Continue from the active layer (currently **Layer 1**). Build only that layer, run its gate, update this file
   + `DECISIONS.md`, then STOP and ask for approval before the next layer.
