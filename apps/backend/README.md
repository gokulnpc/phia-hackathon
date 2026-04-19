# Mirror backend

FastAPI service and try-on worker. Uses `uv` for dependencies.

## Setup

```bash
uv sync
cp .env.example .env
# Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, DATABASE_URL, FASHN_API_KEY
```

## Run API

```bash
uv run mirror-api
```

## Run try-on worker

Separate process on Railway (or locally):

```bash
uv run mirror-tryon-worker
```

## Tests

```bash
uv sync --extra dev
uv run pytest
```

## Railway

1. New Railway project → deploy this GitHub repo.
2. Service **root directory:** `apps/backend` (monorepo). [`railway.toml`](railway.toml) selects the Dockerfile builder.
3. **Variables:** set `SUPABASE_*`, `DATABASE_URL`, `FASHN_API_KEY`, etc. from [`.env.example`](.env.example). Railway sets **`PORT`** (used automatically). **Do not** set `API_PORT=8000` in Railway (copied from local `.env`) or the proxy will miss the app and `/health` will fail.
4. **`mirror-api`:** in Railway → Deploy, set HTTP health check path **`/health`**.
5. **Workers (optional):** add another service with the same root **`apps/backend`**. Either set **Deploy → Start command** to `mirror-tryon-worker` or `mirror-avatar-worker`, or point **Config as code** at `/apps/backend/railway.tryon-worker.toml` or `/apps/backend/railway.avatar-worker.toml` (see repo files). Do not enable HTTP health checks on workers.

See [docs/06_Deployment_Operations.md](../docs/06_Deployment_Operations.md) §3 for domains, scaling, shared variables, and full env reference.
