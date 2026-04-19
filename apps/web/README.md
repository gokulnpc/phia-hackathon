# Mirror — web app

Next.js 14 (App Router) companion for Mirror: sign-in, reference photo onboarding, social **Feed**, **Closet** (try-ons, wishlist, owned), and **Settings**. For a **non-technical, end-user** walkthrough of screens and order, see **[OVERVIEW.md](./OVERVIEW.md)**.

Deep product and architecture docs live in the repo **[`docs/`](../docs/)** (start at [`docs/00_README.md`](../docs/00_README.md)).

## Prerequisites

From the monorepo root: Node 20+, **pnpm** 9, Supabase URL and anon key (see `.env.local.example`).

## Develop

From the repository root:

```bash
pnpm install
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

Or from this package directory:

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Deploy

Mirror’s production web target is **Vercel**. See [`docs/06_Deployment_Operations.md`](../docs/06_Deployment_Operations.md) and root [`README.md`](../README.md).
