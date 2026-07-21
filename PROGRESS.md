# PROGRESS.md — Running State

> **Read first at session start; update at the end of every layer. Keep it short.**
> This is the resume doc — the *what shipped* index. Full rationale for every choice 
> lives in `DECISIONS.md`; headline numbers + architecture live in `README.md`.

## Current status
**Layers 0–9 shipped and deployed. Layer 10 (polish & defense) in progress.**
- **Live UI:** https://frontend-three-gamma-49.vercel.app
- **Live API:** https://docsgpt-agent-ee54gmitka-uc.a.run.app (`/docs`, `/ask`, `/ask/stream`, `/ping`)
- **Now:** Layer 10 — 10a final eval re-run ✅ · 10b README ✅ · **10c resume bullets (in progress)** · 10d demo video (user action) pending.

## Layer checklist
- [x] Layer 0 — Repo scaffold & config
- [x] Layer 1a — Docs ingestion & chunking (11,035 chunks / 751 files, MIT `langchain-ai/docs`)
- [x] Layer 1b — Forum gold-eval seeds (natural labels for Layer 3)
- [x] Layer 2 — Indexing & dense baseline retrieval (Qdrant `docs_dense`, bge-small)
- [x] Layer 3 — Eval harness + gold set (126: 26 real + 100 synthetic) + dense baseline
- [x] Layer 4 — Hybrid retrieval + reranker ablation  ← ship hybrid; reranker rejected as measured negative (D-030/D-031/D-032)
- [x] Layer 5 — Agentic loop + citations  ← 5a cited-RAG + 5b grounding-verify + 5c self-correction retry (D-033–D-041); decomposition/pre-grading measured & rejected (D-037/D-038)
- [x] Layer 5d — RAGAS answer-quality eval (real ragas via our gateway, fixed Groq-8B judge; free-tier-caveated numbers, D-042)
- [x] Layer 6 — API + streaming + rate-limit hardening (FastAPI + SSE of the *verified* answer + per-request metrics + 429-backoff test, D-043)
- [x] Layer 7 — Observability (Langfuse node spans + gateway generation spans; optional/no-op, D-045)
- [x] Layer 8 — Deployment  ← Cloud Run public URL (D-046/D-047) + durability: reindex + Cloud Scheduler keep-alive (D-048)
- [x] Layer 9 — Minimal React/Vite UI on Vercel + Groq/Gemini dropdown (D-049); post-deploy fixes for Gemini fabrication (D-050) + citation 404s (D-051). "Product skin"/BYO-docs dropped per user.
- [ ] Layer 10 — Polish & defense  ← 10a ✅ (eval re-run, D-052) · 10b ✅ (README) · 10c/10d pending

## Layer 10 detail
- **10a — Final eval re-run ✅ (2026-07-12, D-052).** Retrieval (hybrid, `results/eval_hybrid_20260711T193159Z.json`): overall recall@5 **0.693** / mrr@3 0.616 / ndcg@10 0.634; forum n=26 recall@5 0.404; synthetic n=100 recall@5 0.768; p50/p95 579/692 ms — reproduces the recorded Layer 4 numbers. RAGAS re-run with the *deployed* default (Groq 70B, no override; `results/ragas_20260711T193300Z.json`): faithfulness 0.361 / answer_relevancy 0.228 / context_recall 0.449 / context_precision 0.333. Drift vs the old 8B-override run documented, not hidden (D-052).
- **10b — README.md ✅ (2026-07-12).** The "paper": problem framing, architecture diagram, per-source ablation table, RAGAS table (both runs), grounding/refuse safety story, honest caveats. Every number traces to a `results/*.json` file or a `DECISIONS.md` entry.
- **10c — Resume bullets** backed by the results files — in progress.
- **10d — Short demo video** — user action (Claude cannot record).

## Deployed system — quick reference
- **Corpus:** 11,035 chunks / 751 files, MIT `langchain-ai/docs` @ sha 662d399 → `data/corpus/chunks.jsonl` (durable source of truth). Rebuild: `./tasks.ps1 ingest`.
- **Gold set:** 126 items (26 real forum answer-link + 100 synthetic Groq-8B-generated) → `data/gold/gold.jsonl`. Reported per-source, never blended.
- **Retrieval:** hybrid = dense (bge-small-en-v1.5, 384-dim, cosine) + BM25 (`Qdrant/bm25`), client-side RRF k=60. Qdrant Cloud (GCP us-central1) collections `docs_dense` / `docs_hybrid`. Rebuild both: `./tasks.ps1 reindex`.
- **Models (via one LLM gateway, backoff+cache):** Groq `llama-3.3-70b-versatile` = default synthesis; Groq `llama-3.1-8b-instant` = verify + cheap nodes + RAGAS judge; Gemini `gemini-2.5-flash` = opt-in per request (20 req/day free cap).
- **Infra (all free tier):** Cloud Run (scale-to-zero, models baked into image), Vercel Hobby (frontend), Qdrant Cloud, Langfuse (US). Keep-alive: weekly Cloud Scheduler `qdrant-keepalive` → `/ping`.
- **Env:** Windows 11 / PowerShell 5.1 / Python 3.13.3 / `.venv` at repo root. Tasks: `./tasks.ps1 <setup|test|lint|ingest|index|reindex|search|ask|eval|ragas|serve|bench>`.
- **Repo:** `origin` = https://github.com/mahendra-kausik/docsGPT.git. Commits authored by user only (no Claude co-author).

## Open items
- **Pending Cloud Run rebuild:** the D-050 Gemini prompt-hardening fix is baked into the image but ships only on the next `powershell -File deploy/deploy.ps1` (no `-CorsOrigins` override needed — default includes both origins). The D-051 citation-URL fix is already live (Qdrant payloads patched directly). Until the rebuild, the live Gemini path may still refuse on some questions.
- **10d demo video** — user to record.

## Decisions log (one-line index — full entries in `DECISIONS.md`)
- Pre-seeded: D-XXX
- Layer 0: D-XXX

## How to resume
1. Read this file, then `CLAUDE.md`, then the relevant section of `PROJECT_PLAN.md`.
2. Continue from the active layer. Build only that layer, run its gate, update this file + `DECISIONS.md`, then STOP and ask.
