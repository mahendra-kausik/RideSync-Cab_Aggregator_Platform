# CLAUDE.md — Operating Contract for This Project

> It is the source of truth for **how** to build. The **what** lives in `PROJECT_PLAN.md`.
> Every non-trivial choice is logged in `DECISIONS.md`. Session state lives in `PROGRESS.md`.
> When commiting and pushing to github, never leave a co-authored by claude trail and make 
  sure claude doesn't appear as contributor.

---

## 1. What we are building (one paragraph)

**RideSync** — an existing, working MERN cab-aggregator platform (real-time ride matching, geospatial
nearest-driver assignment, dynamic fare estimation, AES-256-GCM PII encryption, JWT/OTP auth, a real
circuit-breaker/graceful-degradation layer, and 578 tests at ~72% coverage) that we are **upgrading into a
deployed, production-shaped, resume-defensible full-stack portfolio piece** — *not* rebuilding from scratch.
The work moves the app from "runs only via Docker Compose" to a **publicly deployed live URL** (Render + Vercel
+ MongoDB Atlas + Upstash Redis, free tier), then adds the production-engineering depth that separates a real
service from a student CRUD app: a **Redis shared-state layer** (sessions + rate limiting + Socket.IO adapter →
genuine horizontal scalability), **load testing with measured numbers** (k6), and **observability** (Prometheus
metrics + Grafana dashboards + request correlation IDs).

The goal is a project that is strong for **SDE/SWE interviews**: deployed, observable, horizontally scalable,
and — critically — with **quantifiable metrics** (throughput, p95 latency, concurrent WebSocket connections)
and every architectural claim (circuit breaker, geospatial matching, scaling) defensible under tough probing.
This project deliberately does **not** add distributed-systems/consensus or AI depth — those live in the user's
two sibling projects. RideSync is the **full-stack, production-engineering, product** piece.

---

## 2. PRIME DIRECTIVE — build one layer at a time, then STOP

This is the single most important rule. **Violating it is a failure, even if the code is correct.**

1. Build **exactly one layer/component** from `PROJECT_PLAN.md` §"Build Layers" at a time.
2. When a layer is done, run its **Acceptance Gate** (the checklist for that layer) and show me the result.
3. Update `DECISIONS.md` (any non-trivial choice made during the layer) and `PROGRESS.md`.
4. **Then STOP and explicitly ask me for approval before starting the next layer.**
   Do not begin the next layer, do not "just scaffold ahead," do not batch two layers together.
5. If a layer turns out to be bigger than expected, split it and stop at the first sub-part.
6. After a layer or sub-layer is completed, commit and push all the changes to github.

When you finish a layer, end your message with:
`✅ Layer <N> complete. Gate results above. Shall I proceed to Layer <N+1>? (yes / adjust / stop)`

---

## 3. Decision-logging rule (for resume defense)

I must be able to explain **every non-trivial decision** in an interview. So:

- Whenever you make a choice that a reviewer could reasonably question — a library, a model, a
  chunk size, a fusion parameter, a metric threshold, a schema, a tradeoff — **append an entry 
  "D-XXX" to `DECISIONS.md`** using the template at the top of that file.
-  Whenever you face a problem while building not due to code logic but something else — such as
  an unexpected crash due to deprecated version, bad plan, etc — **append an entry 
  "P-XXX" to `DECISIONS.md`** using the  template at the top of that file.
- Keep each entry short but complete: Context → Decision → Why → Alternatives considered → Tradeoffs/risks.
- If a decision reverses an earlier one, add a new entry that references the old one (don't silently edit history).
- Trivial choices (variable names, obvious formatting) do **not** need entries. Use judgment; when unsure, log it.

---

## 4. Hard constraints (do not violate without asking)

- **Free tier only.** No paid cloud resources or paid APIs without explicit approval. Every new
  dependency and every hosted service (Render, Vercel, MongoDB Atlas, Upstash, Grafana Cloud, cron-job.org)
  must have a genuinely free tier that needs no credit card unless flagged.
- **Deployable, not localhost.** The end state must run at a public URL: **Render** (Node API + Socket.IO)
  + **Vercel** (React frontend) + **MongoDB Atlas M0** + **Upstash Redis**.
- **Secrets never in git.** Use `.env` locally (git-ignored) and the host's env/secret store in deploy
  (Render env vars, Vercel env vars). Keep `.env.example` / `frontend/.env.example` with keys but no real values.
  Generate a **real 32-byte `ENCRYPTION_KEY`** and a strong `JWT_SECRET` for prod — never ship the dev placeholders.
- **Don't break what works.** 578 backend tests + the frontend Vitest suite must stay green at every layer's
  gate. Preserve public interfaces when refactoring internals (e.g. `sessionManager`), so callers don't change.
- **Graceful degradation is a feature, keep it.** External-service calls route through the existing
  circuit-breaker layer (`GracefulDegradationService`). New shared-state (Redis) must **fall back to in-memory**
  when `REDIS_URL` is unset so local dev still boots without Redis.

---

## 5. Where things live

| File | Purpose |
|---|---|
| `CLAUDE.md` | This file — how to build (protocol, constraints, conventions). |
| `PROJECT_PLAN.md` | What to build — problem, stack, architecture, upgrade layers, roadmap, target metrics. |
| `DECISIONS.md` | Decision log (D-XXX) + problem log (P-XXX) with rationale. Update as you build. |
| `PROGRESS.md` | Running state: what's done, what's next, open questions, how to resume. Update every layer. |
| `.env.example` / `frontend/.env.example` | Required environment variables (names only). |
| `README.md` | Updated LAST — the "paper": architecture diagram, live URLs, load-test tables, honest caveats. |
| `backend/` | Express API, Socket.IO, models, middleware, services, utils, tests. |
| `frontend/` | React + TypeScript + Vite app (contexts, services, components, pages). |
| `load/` | k6 load-test scenarios + results (added in Layer 3). |

At the **start of every session**: read `PROGRESS.md` first to see where we are, then continue from there.
At the **end of every layer**: update `PROGRESS.md` (done / next / blockers) so the next session can resume cleanly.

---

## 6. Coding conventions

- **Language:** Node.js 18+ / Express (CommonJS) for the backend; TypeScript + React 18 + Vite for the frontend.
- **Structure:** keep the existing module seams — `backend/{models,middleware,services,controllers,routes,utils}`
  and `frontend/src/{contexts,services,components,hooks,pages,utils}`. Extend these; don't introduce a parallel
  structure or a monolithic file.
- **Config over magic numbers:** tunables (rate-limit windows, matching radii, fare constants, Redis keys/TTLs,
  metric buckets) belong in one place per side — `backend/config/` — not scattered inline. This keeps the
  scaling/hardening changes defensible and easy to tune.
- **Typed + documented:** type hints on the TS side; a one-line comment saying *why*, not just *what*, on
  non-obvious backend logic. Match the surrounding code's style and comment density.
- **Test the seams:** every layer ships at least a smoke test its Acceptance Gate can run; existing suites stay green.
- **Reproducible measurement:** load-test and metrics runs record the exact config (VUs, duration, target URL,
  commit SHA) into the results file, so numbers on the resume are traceable and re-runnable.
- **Small commits per layer:** one logical commit (or a few) per layer, message referencing the layer number.

---

## 7. Interaction style I want from you

- Before writing code for a layer, give me a **2–4 line plan** of what you're about to do and any decision you're
  about to make that belongs in `DECISIONS.md`. If a decision is genuinely open, ask me rather than guessing.
- Prefer boring, well-supported libraries over clever ones. This is a portfolio project I must defend, not a playground.
- If something in `PROJECT_PLAN.md` looks wrong, outdated, or infeasible on free tier, **flag it and stop** —
  do not silently work around it. The plan may contain assumptions that need re-verification (esp. free-tier limits).
- Keep me in the loop on anything that spends money or approaches a free-tier limit.
- When running shell commands, don't dump the whole output into your context and instead limit it using head or tail with how much you might need 
