# Byte8 Orbit — Documentation Site

Docusaurus 3 site for [Byte8 Orbit](https://byte8.io/products/orbit) — zero-downtime Magento 2 deployments.

Hosted at **https://docs.byte8.io/orbit/** — served under the unified Byte8 docs domain via Cloudflare Pages and a path-based Worker router (see `apps/docs-router/` in the byte8.io monorepo).

## Local development

```bash
cd apps/orbit/docs
nvm use            # picks up Node 22 from .nvmrc
pnpm install
pnpm start
```

Opens at `http://localhost:3000/orbit/` (the `baseUrl` prefix is honoured in dev too).

## Production build

```bash
pnpm build
```

Output goes to `build/`. Deployed via **Cloudflare Pages**:

- **Project:** `docs-orbit` (TBD — confirm Cloudflare-assigned name on first deploy)
- **Build command:** `pnpm install --frozen-lockfile && pnpm build`
- **Build output:** `build`
- **Root directory:** _(blank if this is its own dedicated repo, or `docs` if it sits inside the monorepo when cloned)_
- **Production URL:** `https://docs.byte8.io/orbit/`

## Editing

- **Doc pages** live under `docs/` — mirror the order in `sidebars.ts`.
- **Marketing pages** (`/`) live under `src/pages/` — `index.tsx` is the homepage.
- **Theme overrides** live in `src/css/custom.css` — orange accent (`#F97316`), matching the orbit.byte8.io dashboard primary colour.
- **Blog** = changelog. One markdown file per release under `blog/`, authored as `byte8` (see `blog/authors.yml`).

## Adding a doc page

1. Create the markdown file under `docs/<category>/<slug>.md`
2. Add front-matter:
   ```yaml
   ---
   sidebar_position: 1
   title: Page title
   description: One-sentence summary used by search and social cards.
   ---
   ```
3. Add the slug to `sidebars.ts` if it's not auto-discovered.

## Adding a release note

Drop a new file in `blog/` named `YYYY-MM-DD-<slug>.md` with front-matter:

```yaml
---
slug: v0-6-0-release
title: v0.6.0 — what shipped
authors: [byte8]
tags: [release]
---
```

Authors are defined in `blog/authors.yml`.
