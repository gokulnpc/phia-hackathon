# Mirror extension (WXT)

Chrome MV3 extension built with [WXT](https://wxt.dev), React 19, and Tailwind.

**Plain-language guide for shoppers** (what Mirror does in Chrome, step-by-step, what each screen looks like): [OVERVIEW.md](OVERVIEW.md).

## Commands

From the monorepo root:

```bash
pnpm --filter @mirror/extension-wxt dev
pnpm --filter @mirror/extension-wxt build
```

## Load in Chrome

1. Run `pnpm --filter @mirror/extension-wxt build` (or `dev`) so the extension is built.
2. In Chrome: **Extensions → Load unpacked** and select the folder:

   `apps/extension-wxt/dist/chrome-mv3`

   (This repo sets WXT `outDir` to `dist` so the folder is visible in the file picker. The default `.output` is a **hidden** dot-folder on macOS—use **Cmd+Shift+.** in Finder or the open dialog to show dotfolders if you ever use the default output path.)

Copy `apps/extension-wxt/.env.example` to `.env` and set `VITE_*` variables first.

**`VITE_MIRROR_API_URL`** — Base URL of the FastAPI deployment (same host as **`GET /health`**). Point it at your Railway **mirror-api** service’s public URL in production (`https://…up.railway.app` or custom domain). It must **not** be a try-on worker URL; workers do not serve HTTP on that port.

If **Generate** fails with HTTP **502**, see [docs/06 §3.6](../../docs/06_Deployment_Operations.md): the edge often shows **connection refused** to the API replica when the HTTP service is not listening (`mirror-api` / `PORT`) or has crashed.

## Layout

- `entrypoints/` — WXT entrypoints (background, content script, side panel, overlay iframe page)
- `src/` — React UI (`sidepanel/`), shared `lib/`, content detection + `bootstrap.ts`
