# Mirror

Social virtual try-on layer for Phia — Chrome extension (Side Panel), Next.js web app, FastAPI backend on Railway, Supabase (Postgres + Auth + Storage + Realtime).

## Repo layout

| Path | Description |
|------|-------------|
| `apps/web` | Next.js 14 App Router |
| `apps/extension-wxt` | Chrome MV3 extension (WXT + React) |
| `apps/backend` | FastAPI + workers (`uv`) |
| `packages/sdk-js` | Shared TypeScript client helpers |
| `supabase/` | Migrations, seed, local config |
| `docs/` | Product and technical documentation |

## Prerequisites

- Node 20+, [pnpm](https://pnpm.io/) 9
- Python 3.12 + [uv](https://github.com/astral-sh/uv)
- [Supabase CLI](https://supabase.com/docs/guides/cli) for local DB

## Quick start

1. Copy env templates in each app (see `apps/*/.env.example` when present) and set Supabase URL/keys.
2. **Database:** hosted — from repo root `supabase login`, `supabase link --project-ref <id>`, `supabase db push` (see [docs/E2E_SMOKE.md](docs/E2E_SMOKE.md) §1). Local only — `supabase start` then `supabase db reset`. IDE Supabase plugins do not replace `db push` for repo migrations.
3. `pnpm install` then `pnpm dev:web` or `pnpm dev:extension`.
4. Backend: `cd apps/backend && uv sync && uv run mirror-api` (see `apps/backend/README.md`).

Details: [docs/00_README.md](docs/00_README.md), [docs/06_Deployment_Operations.md](docs/06_Deployment_Operations.md).

Smoke checklist: [docs/E2E_SMOKE.md](docs/E2E_SMOKE.md). Demo friend seeding: [docs/DEMO_SEED.md](docs/DEMO_SEED.md) and [scripts/seed-demo-friends.sql](scripts/seed-demo-friends.sql).

## Demo friends (H12)

Follow [docs/DEMO_SEED.md](docs/DEMO_SEED.md). Track completion in [docs/05_Implementation_Plan.md](docs/05_Implementation_Plan.md) section 2.2a.
