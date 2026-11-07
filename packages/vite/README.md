# @effectmc/vite

The Vite plugin that turns a TypeScript entry into an EffectMC container: one
bundled ES module (`plugin.mjs`) plus the manifest the host reads
(`plugin.json`). ADR-0015 explains why a container is a loose directory in
development and a packed jar for distribution.

Requires Vite 8 (Rolldown) or Vite+ in library mode.

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { effectmc } from "@effectmc/vite";

export default defineConfig({
  plugins: [effectmc()],
});
```

```ts
// src/index.ts
import { Effect, Layer } from "effect";
import { Plugin } from "@effectmc/core";

export default Plugin("hello", Layer.empty, Effect.void);
```

```bash
vite build
```

The output directory contains exactly `plugin.json` and `plugin.mjs`:

```json
{
  "name": "hello",
  "version": "0.1.0",
  "entry": "plugin.mjs"
}
```

## Options

| Option    | Default                                          | Meaning                                              |
| --------- | ------------------------------------------------ | ---------------------------------------------------- |
| `name`    | package.json name, scope removed                 | Container name. Lowercase letters, digits, `-`, `_`. |
| `version` | package.json version, then `0.0.0`               | Container version.                                   |
| `entry`   | `src/index.ts`, `src/index.tsx`, then `index.ts` | Module entry.                                        |
| `outDir`  | Vite's `build.outDir` (usually `dist`)           | Container output directory.                          |

## One module, no externals

The plugin configures library mode with a single ES entry and disables code
splitting. It then fails the build if the output:

- contains more than one chunk,
- has any import or dynamic import left external, or
- is not named `plugin.mjs`.

That keeps the container's entry to the one file the host evaluates. Effect is
bundled in, so the server does not need a module resolver.

## Manifest helpers

The same package exports the manifest contract the host validates:

```ts
import { readContainerManifest, isValidContainerName } from "@effectmc/vite";

const manifest = readContainerManifest("dist");
```

`effectmc dev` uses these helpers to find the container name for the reload
command.
