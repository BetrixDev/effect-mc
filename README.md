# EffectMC

Monorepo for EffectMC, a Paper plugin framework built on Effect.

## Layout

| Path                             | Contents                                                             |
| -------------------------------- | -------------------------------------------------------------------- |
| `apps/docs/`                     | VitePress site with the design notes and plugin patterns             |
| `apps/docs/.vitepress/config.ts` | Site config, nav, and sidebar                                        |
| `host/`                          | `effectmc-host`, the Java Paper plugin that evaluates containers     |
| `packages/core/`                 | `@effectmc/core`: plugin entry, runtime, clock, events, Registry     |
| `packages/commands/`             | `@effectmc/commands`: declared command trees, arguments, permissions |
| `packages/test/`                 | `@effectmc/test`: fakes and a program harness for unit tests         |
| `packages/paper-types/`          | Generated Paper typings, overlays, and the strict consumer           |
| `vite.config.ts`                 | Vite+ workspace, lint, format, and pack config                       |

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
Registry, the tick-driven clock, the event surface, and the swappable
observability layer. It will grow the rest of the v0 core surface described in
`docs/adr/`.

Build or test it directly with:

```bash
vp run @effectmc/core#build
vp run @effectmc/core#test
```

## `@effectmc/commands`

`packages/commands` declares a command tree with subcommands, typed arguments,
permissions, and suggestions, then attaches it with `Commands.attach`. The
tree is re-attached on reload because Paper has no command unregistration.
Attaching returns `void`: there is no handle to hold.

See `packages/commands/README.md` for the surface.

## `@effectmc/test`

`packages/test` runs a plugin program against fakes and exposes the Registry
for assertions, so a unit test never needs a Paper installation.
`TestHarness.teardown` fails when a plugin leaks a registration past teardown.

See `packages/test/README.md` for the harness and fake APIs.

## `effectmc-host`

`host/` is the Java Paper plugin. It requires JDK 25 and builds with Gradle:

```bash
cd host
./gradlew build
```

It also registers `/effectmc reload <name>` for admins. That is a caveated
Context rebuild of one plugin, not hot module reload: other plugins keep their
state, commands are re-registered rather than unregistered, and the sequence is
not production-safe until the 50× leak spike passes.

See `host/README.md` for the container layout, the Graal loader, the reload
contract, and the generated class allow-list.
