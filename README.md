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
| `packages/vite/`                 | `@effectmc/vite`: builds one bundled container module and manifest   |
| `packages/cli/`                  | `effectmc`: the managed server and save-to-reload dev loop           |
| `packages/lint/`                 | `@effectmc/lint`: Oxlint rules for APIs the runtime cannot provide   |
| `vite.config.ts`                 | Vite+ workspace, lint, format, and pack config                       |

## Commands

```bash
npm install
npm run dev        # VitePress dev server
npm run build      # Build every workspace package
npm run preview    # Preview the docs build
npm run check      # Vite+ format, lint, and type checks
npm run lint       # Vite+ lint
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

## `@effectmc/lint`

`packages/lint` rejects APIs the plugin runtime cannot provide: timers,
`require`, dynamic `import()`, top-level `await`, raw `Promise` use, and
`import.meta.url`. Register it in the same `lint` block and spread the
recommended rule map:

```ts
import { defineConfig } from "vite-plus";
import { recommended } from "@effectmc/lint";

export default defineConfig({
  lint: {
    jsPlugins: ["@effectmc/lint"],
    rules: { ...recommended },
  },
});
```

The rules are name-based only (ADR-0018). **Thread violations are not checked
by lint**: `Main` and `AsyncThread` live in the effect's `R`, so the guarantee
comes from the type system plus runtime dev asserts, not from name matching.
See `packages/lint/README.md` for the rule table and the full honesty note.

The workspace registers the plugin from source in `vite.config.ts` and enables
the rules for the packages that run inside the Graal context. The Node toolchain
packages keep their timers and Promises.

## Dev loop

An author project uses both toolchain packages:

```ts
// vite.config.ts
import { effectmc } from "@effectmc/vite";

export default { plugins: [effectmc()] };
```

```bash
npx effectmc dev                 # managed Paper server
npx effectmc dev --server ./srv  # existing installation
```

The loop builds, deploys to `plugins/EffectMC/<name>/`, and sends
`/effectmc reload <name>` over RCON. That is the host's scoped Context rebuild,
not hot module reload. Missing RCON configuration produces an instruction, not
a timeout. See `packages/cli/README.md` and `packages/vite/README.md`.

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

`gradlew packContainer` packs a loose container into `<name>.jar` under
`build/containers/`; the jar can be dropped directly into `plugins/EffectMC/`
and loaded through the same interface as a loose directory.

See `host/README.md` for the container layout, the Graal loader, the reload
contract, and the generated class allow-list.
