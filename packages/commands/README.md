# @effectmc/commands

The Brigadier-backed command surface (ADR-0019). Commands are declared as a
value, attached with `Commands.attach`, and re-attached on reload because Paper
offers no command unregistration (ADR-0011).

```ts
import { Effect, Layer } from "effect";
import { Plugin, Sender } from "@effectmc/core";
import { Argument, Command, Commands } from "@effectmc/commands";

const set = Command.make("set", { name: Argument.String("name") }, (args) =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer;
    yield* Sender.send(`Stored ${args.name} for ${player.name}`);
  }),
);

const warp = Command.make("warp").pipe(
  Command.withDescription("Manage warps"),
  Command.permission("effectmc.warp"),
  Command.withSubcommands([set]),
);

export default Plugin(
  "warps",
  Layer.empty,
  Effect.gen(function* () {
    yield* Commands.attach(warp);
  }),
);
```

`Commands.attach` returns `void`. There is no handle to hold: a command cannot
be unregistered, so a reload re-attaches the tree instead.

## Arguments

An argument is required unless wrapped in `Argument.optional`. Required
arguments arrive as their bare type; optional ones arrive as `Option`.

```ts
import { Effect, Option } from "effect";
import { Argument, Command } from "@effectmc/commands";

Command.make(
  "set",
  {
    name: Argument.String("name"),
    amount: Argument.optional(Argument.Integer("amount")),
  },
  (args) => {
    const name: string = args.name;
    const amount: Option.Option<number> = args.amount;
    return Effect.void;
  },
);
```

Built-ins map to Brigadier types: `Argument.String`, `Argument.Integer`,
`Argument.Boolean`, `Argument.World`, `Argument.BlockPosition`, and the
selector arguments `Argument.Player`, `Argument.Players`, `Argument.Entity`,
and `Argument.Entities`. Selectors and positions are Paper resolvers, so they
resolve against the command source:

```ts
import { Effect } from "effect";
import { Players, Sender } from "@effectmc/core";
import { Argument, Command } from "@effectmc/commands";

const teleport = Command.make("tp", { target: Argument.Player("target") }, (args) =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer;
    yield* Players.teleport(player, args.target.getLocation());
  }),
);
```

For anything else Paper exposes, `Argument.paper` takes the Brigadier
`ArgumentType` and a resolver that receives the command source. The host passes
the type through unchanged; the argument layer never inspects it.

```ts
import type { BlockPositionResolver } from "@effectmc/paper-types";
import { Argument } from "@effectmc/commands";

// `ArgumentTypes` is Paper's Java class, reached through raw interop.
// @effectmc/paper-types supplies only the declaration.
const block = Argument.paper("where", {
  type: ArgumentTypes.blockPosition(),
  resolve: (raw, source) => (raw as BlockPositionResolver).resolve(source.native!),
});
```

## Permissions

`Command.permission` is declared once and enforced twice. The command node
exposes `requires`, which the Paper host wires into Brigadier's `requires`
predicate, so a sender without the permission never sees the command. Execution
checks again and fails with the tagged `PermissionDenied` error, so a hidden
command cannot be reached through a stale client graph (ADR-0019). A permission
on a parent protects its whole subtree, at registration and at execution.

A command whose handler calls `Sender.asPlayer` is player-only. The console
fails with the dedicated `SenderNotPlayer` error, never with
`PermissionDenied` (ADR-0020).

## Suggestions

`Argument.suggest` runs a provider with `Main` on the dispatch thread. A slow
provider stalls the tick; the time budget is a real hazard (ADR-0019). The host
combines these values with the Paper argument type's own suggestions.

```ts
import { Effect } from "effect";
import { Main } from "@effectmc/core";
import { Argument } from "@effectmc/commands";

const name = Argument.String("name", {
  suggest: (request) =>
    Effect.gen(function* () {
      yield* Main;
      return warpNames.filter((name) => name.startsWith(request.remaining));
    }),
});
```

## Execution and tests

`Command.run(command, invocation)` is the execution seam. It supplies `Main`
and the command's sender, resolves arguments, re-checks the permission, and
runs the handler. The Paper host and unit tests both use it; a failure's
presentation belongs to the boundary in `@effectmc/core` (ADR-0005).

`TestHarness` from `@effectmc/test` installs a fake registrar and exposes
`harness.commands.roots()`. Attaching a root with the same label replaces it,
which is what a reload does.
