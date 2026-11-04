# EffectMC

Monorepo for EffectMC, a Paper plugin framework built on Effect.

## Layout

| Path                             | Contents                                                 |
| -------------------------------- | -------------------------------------------------------- |
| `apps/docs/`                     | VitePress site with the design notes and plugin patterns |
| `apps/docs/.vitepress/config.ts` | Site config, nav, and sidebar                            |
| `packages/core/`                 | `@effectmc/core` placeholder package                     |
| `vite.config.ts`                 | Vite+ workspace, lint, format, and pack config           |

## Commands

```bash
npm install
npm run dev        # VitePress dev server
npm run build      # Build every workspace package
npm run preview    # Preview the docs build
npm run check      # Vite+ format, lint, and type checks
npm run test       # Vite+ tests across the workspace
```

Run Vite+ commands directly with `vp`, or through the npm scripts above.

## Docs

Pages live in `apps/docs/` and use Markdown with frontmatter:

```md
---
title: Overview
description: A short description for SEO and link previews.
---

# Overview

## Section

Body text.
```

Use `##` for sections. The nav and sidebar are defined in
`apps/docs/.vitepress/config.ts`; add a page there when you add a new Markdown
file.

Internal links are absolute and clean, for example `/design/threading`.

## `@effectmc/core`

`packages/core` is intentionally a placeholder. It exports a package-name
constant so the workspace resolves and packs, and it will grow the v0 core
surface described in `apps/docs/design/`.

Build or test it directly with:

```bash
vp run @effectmc/core#build
vp run @effectmc/core#test
```
