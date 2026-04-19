# Mirror extension (WXT)

Chrome MV3 extension built with [WXT](https://wxt.dev), React 19, and Tailwind.

## What this package is

Mirror sits in the side panel while you shop. It answers two questions retailers rarely put next to each other: **how does this look on someone real** (including posts from Mirror and matches from the wider web in **Worn by**), and **how does it look on you** (virtual try-on from your reference photos). Home also surfaces **fit score** against clothes you marked as owned, optional **editorial** polish on try-on output, share to **Feed**, and a light **Circle** surface for product-scoped preview. Same Supabase session as the Mirror web app.

**End-user walkthrough** (screens, order, plain language): [OVERVIEW.md](OVERVIEW.md).

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

   (This repo sets WXT `outDir` to `dist` so the folder is visible in the file picker. The default `.output` is a **hidden** dot-folder on macOS. Use **Cmd+Shift+.** in Finder or the open dialog to show dotfolders if you ever use the default output path.)

Copy `apps/extension-wxt/.env.example` to `.env` and set `VITE_*` variables before building.

## Environment

**`VITE_MIRROR_API_URL`** — Base URL of the FastAPI deployment (same host as **`GET /health`**). In production, point at your Railway **mirror-api** public URL (`https://…up.railway.app` or your custom domain). Do **not** point this at a worker-only service; workers do not serve HTTP on that port.

For local backend development, use `http://localhost:8000` (or whatever port **`mirror-api`** prints). After changing `.env`, rebuild or run `dev`, then reload the extension in **chrome://extensions** so the bundle picks up the value.

If **Generate** returns HTTP **502**, see [docs/06 §3.6](../../docs/06_Deployment_Operations.md): Railway often shows **connection refused** when the HTTP service is not listening (`mirror-api`, **`PORT`**) or has crashed.

## Side panel tabs (bottom nav)

Order in the UI: **Home**, **Try-on**, **Circle**, **Worn by**, **Feed**. In development, **Fit** may appear from the dev tab bar for fit-score debugging.

## Layout

- `entrypoints/` — WXT entrypoints (background, content script, side panel, overlay iframe page)
- `src/sidepanel/` — React UI (views, confidence card, navigation)
- `src/lib/`, content detection, `bootstrap.ts`

Deep product and API docs: **[`docs/`](../../docs/)** (start at [`docs/00_README.md`](../../docs/00_README.md)).
