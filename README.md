# EffectMC

Monorepo for EffectMC, a Paper plugin framework built on Effect.

## Layout

| Path                             | Contents                                                         |
| -------------------------------- | ---------------------------------------------------------------- |
| `apps/docs/`                     | VitePress site with the design notes and plugin patterns         |
| `apps/docs/.vitepress/config.ts` | Site config, nav, and sidebar                                    |
| `host/`                          | `effectmc-host`, the Java Paper plugin that evaluates containers |
| `packages/core/`                 | `@effectmc/core`: plugin entry, runtime, clock, and Registry     |
| `packages/paper-types/`          | Generated Paper typings, overlays, and the strict consumer       |
| `vite.config.ts`                 | Vite+ workspace, lint, format, and pack config                   |

## Commands

```bash
npm install
npm run dev        # VitePress dev server
npm run build      # Build every workspace package
npm run preview    # Preview the docs build
npm run check      # Vite+ format, lint, and type checks
npm run test       # Vite+ tests across the workspace
npm run generate:allow-list  # Regenerate the host's Java allow-list from Paper typings
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

`packages/core` holds the `Plugin` entry point, `PluginRuntime`, the teardown
Registry, the tick-driven clock, and the swappable observability layer. It will
grow the rest of the v0 core surface described in `docs/adr/`.

Build or test it directly with:

```bash
vp run @effectmc/core#build
vp run @effectmc/core#test
```

## `effectmc-host`

`host/` is the Java Paper plugin. It requires JDK 25 and builds with Gradle:

```bash
cd host
./gradlew build
```

See `host/README.md` for the container layout, the Graal loader, and the
generated class allow-list.
