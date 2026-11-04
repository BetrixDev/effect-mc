---
title: Commands
description: A /warp go command tree.
---

# Commands

The author surface is inspired by effect/cli and stays thin over Brigadier on Paper. `Command.permission` feeds Brigadier `requires` and a runtime re-check.

```typescript
import { Argument, Command } from "@effectmc/commands"
import { Effect } from "effect"
import { Sender, Paper } from "@effectmc/core"

const warp = Command.make("warp").pipe(
  Command.withDescription("Teleport to a warp"),
  Command.permission("effectmc.warp"),
)

const go = Command.make(
  "go",
  { name: Argument.String("name") },
  (config) =>
    Effect.gen(function* () {
      const player = yield* Sender.asPlayer
      const warps = yield* WarpService
      const loc = yield* warps.get(config.name)
      yield* Paper.on(player, Effect.sync(() => player.teleport(loc)))
    }),
)

export const WarpRoot = warp.pipe(
  Command.withSubcommands([go]),
)
```

`set`, `list`, and `del` subcommands follow the same shape. See [warps](/patterns/warps) and [commands](/design/commands).
