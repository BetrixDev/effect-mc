# @effectmc/paper-types

Generated TypeScript declarations for the pinned Paper API. The package is
type-only: it has no runtime code and no runtime dependency on Paper.

```ts
import type { BlockBreakEvent, ItemStack, Player, World } from "@effectmc/paper-types";
```

The full API is also available under its Java package names:

```ts
import type { org } from "@effectmc/paper-types";

declare const player: org.bukkit.entity.Player;
```

## Pin

The generator reads `paper-api.json` and downloads the exact artifact, checking
its SHA-256 before parsing it:

```
io.papermc.paper:paper-api:26.3.build.230-stable
```

Regenerate committed declarations:

```bash
npm run generate --workspace @effectmc/paper-types
```

Verify that regeneration produces no diff:

```bash
npm run check --workspace @effectmc/paper-types
```

This is the package's regeneration check, not the root `npm run check`
(formatting, lint, and types). `npm test` also runs the regeneration check.

The jar is cached under `packages/paper-types/.cache/`, which is gitignored. A
different artifact cannot silently change the output because the hash check
fails first.

`@effectmc/paper-types` is also the source of the class-name allow-list in
ADR-0013. That boundary is **which classes may be looked up**, not which members
of those classes are reachable.

## Overlays

Some Paper declarations cannot be expressed faithfully from a class file. An
overlay is a small `.d.ts` in `overlays/` with a required target and reason:

```ts
/**
 * @target org.bukkit.World
 * @mode merge
 * @reason World's ForwardingAudience superinterface lives outside paper-api, so its sendMessage members are not generated.
 */
export namespace org.bukkit {
  export interface World {
    sendMessage(message: __paperExternal.net.kyori.adventure.text.Component): void;
  }
}
```

- `@target` is the generated class (dotted binary name).
- `@reason` is one line. It is copied into `generated/index.d.ts` and the
  manifest so the patch is visible, not a hidden local edit.
- `@mode` is `merge` or `replace` (default `replace`). `merge` keeps the
  generated class and appends the overlay, which is the right shape for adding
  interface or namespace members. `replace` omits the generated declaration and
  uses the overlay's declaration instead, for corrections that cannot be
  merged; a replace overlay must declare its target name.

The generator rejects an overlay with a missing reason, a duplicate target, an
unknown mode, a missing target, or a replace body that does not declare the
target.

## Type mapping

The emitter makes a few deliberate TypeScript-shaped choices:

| Java                                   | TypeScript                           |
| -------------------------------------- | ------------------------------------ |
| primitives and boxed primitives        | `number`, `boolean`, `string`        |
| arrays                                 | `T[]`                                |
| `List`, `Queue`, `Deque`               | `T[]`                                |
| `Collection`, `Iterable`               | `T[] \| ReadonlySet<T>`              |
| `Set`                                  | `ReadonlySet<T>`                     |
| `Map`                                  | `ReadonlyMap<K, V>`                  |
| `Optional<T>`                          | `T \| undefined`                     |
| `CompletableFuture<T>`                 | `Promise<T>`                         |
| `Function`, `Predicate`, `Consumer`, … | function types                       |
| types outside `paper-api`              | declarations under `__paperExternal` |

Nested classes are flattened with `$` (`Player$SpawnCategory`) so nested types
do not become static members of their outer class in TypeScript.

Type parameters keep their Paper constraints. Type arguments that Paper writes
as wildcards become `any`, because TypeScript has no wildcard. Raw Java types
are padded with `any` type arguments.

## Publishing

`package.json` exposes only the `types` condition, pointing at
`generated/index.d.ts`. There is no runtime entry point and no dependency on
Paper, Bukkit, or Adventure. `npm pack --workspace @effectmc/paper-types`
includes the generated declarations and this README.
