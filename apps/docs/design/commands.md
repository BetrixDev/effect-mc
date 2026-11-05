---
title: Commands
description: The thin Brigadier-backed @effectmc/commands surface.
---

# Commands

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

`@effectmc/commands` is a separate package with its own author surface, inspired by effect/cli: `Command.make`, `Flag` / `Argument`, subcommands, and `Command.permission`. It stays **thin on Paper**:

- It maps arguments to Brigadier `ArgumentTypes`.
- It separates sender from executor (`CommandSourceStack`).
- It checks permissions in Brigadier `requires` and again at runtime.
- It renders help with Adventure.

It is not a second full CLI framework.

## Example: `/warp set`

```typescript
import { Argument, Command, Flag } from "@effectmc/commands"

const warp = Command.make("warp").pipe(
  Command.withDescription("Manage warps"),
  Command.permission("effectmc.warp"),
)

const set = Command.make("set", {
  name: Argument.String("name"),
}, (config) =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer
    const warps = yield* WarpService
    yield* warps.set(config.name, player.location)
  }),
)

const WarpRoot = warp.pipe(Command.withSubcommands([set]))
// Tree shape registered at load; handler table hot-swappable on reload
```

## Rules

1. Check permissions in Brigadier `requires` **and again at execute**. Call `updateCommands` when permissions change.
2. Suggestions may run off-main. They follow the same thread rules as async events: a time budget and no world access.
3. Use Paper `ArgumentTypes` (`player`, `blockPosition`, selectors) and resolve them against the command source.
4. Unit-test with `Command.runWith`-style fake arguments. Tests don't need Paper.

Commands execute with `Main` in `R`. See [threading](/design/threading).
