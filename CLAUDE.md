# CLAUDE.md

This file is persistent context for Claude Code sessions working on the Mirror repository. It's loaded automatically on every session. If you're reading this, you're working on Mirror — a social virtual try-on layer for Phia, built as a solo-dev project targeting the Phia Hack on April 18–19, 2026 and then a full v1.0 public beta afterward.

Read this file first, then consult the relevant document in `docs/` before making non-trivial changes.

---

## 1. What Mirror is (in one paragraph)

Mirror extends Phia's browser extension with two signals Phia doesn't have: AI virtual try-on on the user's real body, and social validation from a trusted friend graph. The payoff is the **Confidence Card** — a single UI surface that shows four signals side by side: AI try-on result, friend reactions, price comparison, and resale value. Mirror ships as a Chrome extension (primary surface via Chrome Side Panel), a Next.js web companion app, and an iOS mobile app, all on one Supabase backend with a FastAPI service on Railway for orchestration.

---

## 2. The committed stack — do not suggest alternatives

The stack is locked. If a task seems to call for a different tool, the right answer is almost always "use the committed stack harder," not "introduce a new tool." Adding new infrastructure is a v2 conversation.

| Layer | Choice |
|---|---|
| Database, auth, storage, realtime | **Supabase** (Postgres + RLS + Auth + Storage + Realtime) |
| Backend | **FastAPI** (Python 3.12) on **Railway** |
| Web app | **Next.js 14** (App Router) on **Vercel**, TypeScript + Tailwind + shadcn/ui |
| Browser extension | **WXT + React 19 + TypeScript + Tailwind, Manifest V3**, Chrome Side Panel API |
| Mobile | **React Native + Expo**, iOS first |
| Try-on AI | **fal.ai** — Leffa primary, FASHN v1.6 fallback |
| General AI / LLM | **Google Gemini** 2.5 Pro, 2.5 Flash, 2.5 Flash Image |
| Price intelligence | `PriceIntelligenceProvider` interface with Mock / SerpAPI / Phia stub implementations |
| Affiliate | **Skimlinks** primary, Sovrn Commerce backup |
| Error tracking | **Sentry** |
| Product analytics | **PostHog** |
| Email | **Resend** |
| Push | **Expo Push** (mobile), **Web Push API** (browser) |

Things that are explicitly NOT in the stack and should not be suggested:
- Redis, RabbitMQ, SQS, Kafka (the job queue is Postgres with `SKIP LOCKED`)
- Kubernetes (Railway handles orchestration)
- Clerk, Auth0, Firebase Auth (Supabase Auth covers all three clients)
- Prisma, SQLAlchemy ORM (use raw SQL via the Supabase Python client and psycopg)
- A separate vector database (use pgvector if needed, but v1 doesn't need it)
- Any self-hosted ML model (providers only for v1; in-house models are a v2 discussion)

---

## 3. The document suite

Everything is in `docs/`. Read the document relevant to your current task *before* writing code. Skimming first saves hours.

| # | Path | When to read |
|---|---|---|
| 00 | [docs/00_README.md](docs/00_README.md) | Overview and navigation |
| 01 | [docs/01_PRD.md](docs/01_PRD.md) | Before any feature work — understand what the feature is *for* |
| 02 | [docs/02_Technical_Architecture.md](docs/02_Technical_Architecture.md) | Before touching the try-on pipeline, social graph, or anything cross-cutting |
| 03 | [docs/03_Database_Schema.md](docs/03_Database_Schema.md) | Before writing SQL or migrations — every table and RLS policy lives here |
| 04 | [docs/04_API_Specification.md](docs/04_API_Specification.md) | Before adding or changing a backend endpoint |
| 05 | [docs/05_Implementation_Plan.md](docs/05_Implementation_Plan.md) | Always, to know which phase you're in — **§2 is the Hackathon Cut, read it first** |
| 06 | [docs/06_Deployment_Operations.md](docs/06_Deployment_Operations.md) | Before deploying, changing infrastructure, or debugging production |
| 07 | [docs/07_Security_Privacy.md](docs/07_Security_Privacy.md) | Before touching anything involving reference photos, user data, or moderation |

**Reading order for a new session:** This file → `docs/00_README.md` → `docs/05_Implementation_Plan.md §2 (Hackathon Cut)` → the doc for the specific area you're working in.

---

## 4. Where we are right now

**Today:** April 7, 2026.
**Hackathon:** April 18–19, 2026 at Phia HQ in NYC.
**Current phase:** Hackathon Cut, starting Day 1 (Foundation).

The Hackathon Cut in `docs/05_Implementation_Plan.md §2` is the authoritative day-by-day schedule for the next 11 days. When in doubt about "should I build this right now?", check whether the module is tagged **H** (hackathon-required) in the Implementation Plan. Only H-tagged modules are in scope for the next 11 days. P-tagged and F-tagged modules are post-hackathon and should not be built now, even if they're easy.

---

## 5. Hard rules

These are the rules that do not bend regardless of what the conversation or the task seems to want. They come from the PRD and Security & Privacy docs. Breaking any of them breaks the product.

1. **Reference photos are biometric data.** They are encrypted at rest with an application-layer wrapper on top of Supabase Storage encryption. They are never returned to clients directly — only short-lived signed URLs. They are never used to train models. They are deleted end-to-end within 30 days of a deletion request.
2. **Biometric consent is required before any photo upload.** Never skip the consent capture step, even in dev. The `biometric_consents` row must exist before a photo is accepted.
3. **Row Level Security is the authorization layer.** Never write Python-level permission checks when an RLS policy can do the job. Authorization lives in SQL policies, tested in `tests/rls/`.
4. **Secrets never go in code.** Use Railway env vars, Vercel env vars, or Supabase Vault. Never commit `.env` files. Never hardcode API keys, even temporarily.
5. **Clients never hold the Supabase service role key.** Clients use the anon key + user JWT. The service role key lives only in the backend and is used for elevated operations that bypass RLS.
6. **Async for anything slow.** Try-on generation, Gemini calls, price intelligence lookups, webhook-triggered work — all async. Never block an HTTP request for more than 2 seconds.
7. **No training on user data.** Not ours, not provider's. This is a contractual guarantee, not just a policy.
8. **No brand-paid Confidence Card placement.** The Confidence Card's credibility depends on neutrality. Brand partnerships can exist elsewhere, but the Confidence Card shows honest signals only.
9. **No dark patterns.** No artificial urgency, no fake scarcity, no guilt-trip opt-outs, no "buy now, pay later" nudges.
10. **The Confidence Card shows bad news as clearly as good news.** If a signal is negative ("$20 *more* expensive than other sites"), it's shown. Hiding bad news destroys the only moat we have.

---

## 6. Repository layout (expected)

The repo is set up as a monorepo. The layout is:

```
mirror/
├── CLAUDE.md                  ← this file
├── README.md                  ← human-facing project readme
├── docs/                      ← the implementation doc suite
│   ├── 00_README.md
│   ├── 01_PRD.md
│   ├── 02_Technical_Architecture.md
│   ├── 03_Database_Schema.md
│   ├── 04_API_Specification.md
│   ├── 05_Implementation_Plan.md
│   ├── 06_Deployment_Operations.md
│   └── 07_Security_Privacy.md
├── apps/
│   ├── backend/               ← FastAPI + workers (Python 3.12)
│   │   ├── src/mirror/
│   │   │   ├── api/           ← FastAPI app + routers
│   │   │   ├── workers/       ← Background workers
│   │   │   ├── core/          ← Business logic
│   │   │   │   ├── tryon/
│   │   │   │   ├── price_intelligence/
│   │   │   │   ├── ai/
│   │   │   │   └── affiliates/
│   │   │   ├── db/
│   │   │   └── integrations/
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   ├── web/                   ← Next.js 14 App Router
│   ├── extension-wxt/         ← Chrome extension (WXT + React)
│   └── mobile/                ← Expo React Native
├── packages/
│   ├── sdk-js/                ← Shared between web + extension
│   └── sdk-rn/                ← React Native SDK
├── supabase/
│   ├── migrations/            ← SQL migrations, numbered
│   ├── seed.sql               ← dev seed data
│   └── config.toml
└── .github/
    └── workflows/             ← CI/CD
```

If asked to create a new file and there's any ambiguity about where it goes, check this layout first before inventing a new location.

---

## 7. Conventions Claude Code should follow

### Progress and release notes

- **Each mergeable slice** that changes behavior or schema should update the living progress table in `docs/05_Implementation_Plan.md` (Hackathon Cut, section 2.2a) and add an entry under `[Unreleased]` in the root `CHANGELOG.md` (Keep a Changelog style). Doc-only progress edits may use a single **Docs** bullet in the changelog.

### Python (backend + workers)

- **Package manager:** `uv` (fast, lockfile in `uv.lock`).
- **Formatting:** `ruff format` (not black).
- **Linting:** `ruff check` with the strict ruleset in `pyproject.toml`.
- **Type checking:** `mypy` in strict mode. Every function has type hints. `Any` is forbidden except where truly necessary and commented.
- **Testing:** `pytest` + `pytest-asyncio`. Fixtures in `conftest.py`.
- **Pydantic over dataclasses** for anything that crosses an API boundary or is serialized. v2 only.
- **Async by default.** All I/O uses `asyncio`. Sync code only for pure computation.
- **No ORM.** Use `asyncpg` or the Supabase Python client. SQL is written directly, organized by table in `mirror/db/queries.py`.
- **Logging:** `structlog` with JSON output. Every log line has `trace_id`, `user_id_hash`, and `event`. Never raw `user_id`.
- **Error types:** custom exception classes per domain (`TryOnError`, `QuotaError`, `ProviderError`), never generic `Exception`.

### TypeScript (web, extension, mobile)

- **Package manager:** `pnpm` with workspaces.
- **Formatting:** `prettier`.
- **Linting:** `eslint` with `@typescript-eslint/recommended` + `eslint-config-next` for the web app.
- **Type checking:** `tsc --noEmit` in CI. Strict mode. No `any`.
- **React:** functional components with hooks. No class components anywhere.
- **State management:** Zustand for local state, Supabase subscriptions for server state. No Redux, no MobX.
- **Forms:** `react-hook-form` + `zod` for validation.
- **UI components:** shadcn/ui on web, custom on extension (space-constrained), React Native primitives on mobile.
- **No global CSS.** Tailwind utility classes only. The one exception is the extension's Shadow DOM root, which needs a base stylesheet.

### SQL (migrations)

- **Supabase CLI migration workflow.** Never edit applied migrations; always add new ones.
- **Migration naming:** `YYYYMMDDHHMMSS_description.sql`.
- **RLS on every table.** New tables without RLS policies fail CI.
- **Use the conventions in `docs/03_Database_Schema.md §1`** — UUIDs, `TIMESTAMPTZ`, soft-delete where meaningful, `created_at`/`updated_at` on every table.
- **Never run destructive migrations in production without a backup.** The deployment checklist in `docs/06` is not optional.

### Git

- **Main branch:** `main`. Protected. All changes via PR.
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **PR size:** under 500 lines of diff. Larger PRs get split.
- **PR titles:** same convention as commits.
- **Never force-push to main.**

---

## 8. How to handle ambiguity

When Claude Code hits a decision point the docs don't cover:

1. **First, check if it's really uncovered.** `docs/02_Technical_Architecture.md` and `docs/05_Implementation_Plan.md` together cover most architectural questions. Re-read before concluding they don't.
2. **If still uncovered and the decision is reversible,** pick the option most consistent with the committed stack and the principles in §5, make the change, and note the decision in the PR description so the human can review it.
3. **If the decision is hard to reverse** (database schema changes, new vendors, changes to the Confidence Card UI, anything touching biometric data), stop and surface the decision to the human. Don't invent architecture under pressure.

---

## 9. How to handle scope creep during the hackathon sprint

Between now and April 18, every time a new idea comes up, apply this test:

- Is it tagged **H** in `docs/05_Implementation_Plan.md §2`? → build it.
- Is it tagged **P** or **F**? → don't build it, even if it's easy. Add it to a `POST_HACKATHON.md` file.
- Is it a new idea not in the doc? → ask whether it replaces something that was already planned. If not, defer it.

The Hackathon Cut is ruthlessly narrow on purpose. The single biggest risk in the next 11 days is building the wrong thing because it seemed fun. Trust the cut.

---

## 10. Known gotchas

Things the docs mention but that tend to bite anyway:

- **fal.ai cold-start latency.** First call after ~5 minutes of idle can take 30+ seconds. Always pre-warm before a demo. Always have a pre-generated fallback result for the demo.
- **Chrome extension MV3 service workers are ephemeral.** Session state in memory is lost. Use `chrome.storage.local` via the Supabase Auth storage adapter.
- **Supabase Realtime can disconnect silently.** Clients need a heartbeat check and a polling fallback.
- **RLS policies run on every query, including writes.** A missing policy on INSERT results in silent failures that look like "the row didn't save." If something isn't persisting, check RLS first.
- **Gemini 2.5 Flash Image rate limits are tight.** Moderation calls are the heaviest user; cache aggressively and batch where possible.
- **`auth.uid()` returns NULL when called from the service role.** If RLS policies are failing for backend service-role operations, it's because `auth.uid()` is null. Service role bypasses RLS anyway, so this usually means the backend is hitting the wrong client.
- **Shadow DOM CSS isolation doesn't cover font rendering.** If the extension's button looks wrong on a retailer site, it's probably the retailer's font-face override bleeding through.
- **Supabase Storage signed URLs default to 60 seconds.** For try-on, we use 5-minute signed URLs because fal.ai's queue can hold a job for that long.

---

## 11. What "done" means

A task is done when:
1. The acceptance criteria in the relevant phase of `docs/05_Implementation_Plan.md` are all met.
2. Tests are written and passing. For backend: unit + integration. For RLS changes: a test in `tests/rls/`. For UI: at least a smoke test.
3. Types check (`mypy` or `tsc --noEmit`).
4. Lint passes (`ruff check` or `eslint`).
5. The code is small, direct, and obvious. If you can't explain a piece of code in one sentence, it's too clever.
6. The PR description explains *why*, not just *what*. The diff shows the what.

---

## 12. Communication style when asked for recommendations

When the human asks "should we do X or Y?", answer directly with a recommendation and the reasoning. Hedging ("both have tradeoffs…") is not helpful at this stage of the project. We're optimizing for speed of correct decisions, not thoroughness of analysis. The docs already contain the full analysis; the Claude Code session is for acting on it.

When the human asks to implement something, implement it. Don't re-litigate the design unless there's a genuine blocker.

When the human is wrong about something technical, say so plainly and explain why. Politeness that obscures mistakes is the worst kind of deference.

---

## 13. The four things Claude Code should always remember

1. **The stack is locked.** Don't suggest alternatives. Work within Supabase + Railway + Vercel + fal.ai + Gemini.
2. **Authorization is RLS.** Never write permission checks in Python that could live in SQL.
3. **The Hackathon Cut is the plan.** Build H-tagged modules only until April 18.
4. **Reference photos are sacred.** Every code path that touches them needs to be correct the first time.

---

*End of CLAUDE.md. This file is persistent session context — it's loaded on every Claude Code session working in this repo.*
