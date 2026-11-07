# @effectmc/core

The plugin entry point, runtime, tick-driven clock, Registry, event surface,
and observability seam.

A plugin module default-exports one declarative value (ADR-0001):

```ts
import { Effect, Layer } from "effect";
import { Plugin, Registry } from "@effectmc/core";

export default Plugin(
  "demo",
  Layer.empty,
  Effect.gen(function* () {
    const registry = yield* Registry;
    // Attach verbs land here in later releases.
    registry.add({ kind: "task", name: "sweep" });
  }),
);
```

`PluginRuntime` builds the Layer, runs the program to completion, and keeps
attach work alive in a runtime-owned scope. Tear it down with `dispose()`: it
closes the scope, empties the Registry, and disposes the Layer runtime.
Disposal is terminal, so a reload constructs a new `PluginRuntime`.

A host may pass `hostServices` to provide surfaces that live outside core, such
as `CommandRegistrar` from `@effectmc/commands`. Those services are present at
runtime without becoming part of a plugin program's declared requirements.

Plugin time comes from a `TickClock`. One tick is 50 ms, and the clock is
anchored at construction and then moves only when the host calls `advance()`; it
never follows the system clock or installs a timer. A host creates one clock,
passes it to each runtime through `PluginRuntimeOptions.clock`, and advances it
once per server tick. A paused or stopped server simply stops advancing, so
`Effect.sleep`, schedules, and timeouts freeze with it. Tests advance the same
clock explicitly instead of waiting.

Events attach through the runtime's event bus. A sync attachment runs before
the Java listener returns, so `cancel` lands in time; the window closes when
the handler returns, and a later cancel fails with `AsyncInCancellableHandler`:

```ts
import { Effect } from "effect";
import { Events } from "@effectmc/core";

const protect = Effect.gen(function* () {
  yield* Events.attach(BlockBreakEvent, { mode: "sync" }, (event) =>
    Effect.gen(function* () {
      if (!allowed(event.player)) {
        yield* event.cancel;
      }
    }),
  );
});
```

The four curated façades carry `Main` in `R`, so a world-mutating call from
async code is a compile error until it is wrapped in a hop:

```ts
import { Players, Paper } from "@effectmc/core";

yield * Players.teleport(player, location); // Effect<boolean, never, Main>

yield * Paper.on(player, Players.teleport(player, location)); // Main supplied
```

`Sender` reads the ambient command source and `Sender.asPlayer` fails with
`SenderNotPlayer` for the console. A command's permission check re-fails at
execution with `PermissionDenied`, kept distinct from "not a player". `Worlds` wraps block reads and writes, and
`Items.editPdc(stack, (pdc) => ...)` edits item data through a scoped handle.
Raw Bukkit remains reachable; it compiles and runs but is outside the thread
checker (ADR-0003).

`Pdc` declares a namespace of Schema-typed keys once. Primitives map to their
native PDC type, structs become nested containers, and anything else is stored
as JSON in a string. Reads yield `Option.none` for absence and fail with
`PdcDecodeError` for corruption; the operations require `Main` (ADR-0009,
ADR-0014):

```ts
import { Effect, Option, Schema } from "effect";
import { Pdc, Paper } from "@effectmc/core";

const Home = Schema.Struct({
  world: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
});

const Keys = Pdc.namespace("homes", { home: Home, owner: Schema.String });

const readOwner = Effect.gen(function* () {
  yield* Paper.on(player, Pdc.set(player, Keys.home, { world: "world", x: 1, y: 2 }));
  const owner = yield* Paper.on(player, Pdc.get(player, Keys.owner)); // Option<string>
  return Option.getOrNull(owner);
});
```

A struct write compares fields and only rewrites the ones that changed. An
`ItemStack` is not a `PersistentDataHolder`, so its edits go through
`Items.editPdc`; the typed handle is closed when the callback returns:

```ts
yield * Items.editPdc(stack, (pdc) => pdc.set(Keys.owner, "alex"));
```

An async attachment runs with `AsyncThread`, not `Main`, so it cannot cancel or
touch the world directly. Hop with `Paper.on(player, effect)` when it needs
`Main`:

```ts
const observeChat = Effect.gen(function* () {
  yield* Events.attach(AsyncChatEvent, { mode: "async" }, (event) =>
    Effect.gen(function* () {
      yield* AsyncThread;
      yield* Paper.on(event.getPlayer(), sendReply(event));
    }),
  );
});
```

`Paper.on` is a no-op when the fiber already holds `Main` for the same region.
`Paper.offload(() => ...)` runs Java work on a worker and resumes without
`Main`, so heavy work does not block the tick:

```ts
const row = yield * Paper.offload(() => database.fetch(uuid));
yield * Paper.on(player, Players.teleport(player, row.location));
```

Paper can fire an event on a thread its class does not suggest. In development
a dispatch whose actual threading disagrees with the attachment's declared mode
throws `EventThreadingMismatch`; production skips the mismatched group.

Listeners are grouped per event type, priority and mode, so attachments in the
same combination share one host listener. `ignoreCancelled` is honored per
attachment, and detaching removes both the attachment and its Registry entry.
`Events.of` is the read path: it yields the same `EventHandle` elements but
delivers after the dispatch, so its elements are snapshots.

A program whose requirements its Layer does not satisfy is a compile error.
Development runtimes warn instead of hanging when a program does not complete;
the warning window is server time too. Pass `observability` to
`PluginRuntime.make` to replace the default console layer.

## Errors at the boundaries

A command executor and an event dispatch are boundaries, and each has a
different failure policy (ADR-0005). A command runs through
`CommandNode.dispatch`, which wraps its raw `execute` in `Boundary.command`: a
tagged failure renders to the command's sender, an untagged defect is logged
with its stack, and the effect never fails. One bad command cannot take down
the tick.

Events apply their policy during dispatch. A tagged failure renders and logs. An
untagged defect fails loudly in development by rethrowing from the listener, and
renders and logs in production. Async handlers always render and log because the
async path has no cancel window to protect. That development/production
divergence on the sync path is intentional.

`Renderer` is the swappable service behind both paths. Its default maps
`PermissionDenied` and `SenderNotPlayer` to distinct messages, because "you lack
permission" and "the console cannot teleport" have different fixes (ADR-0020),
and renders any other tagged error's own message. The rendered value is text;
the Paper host binds it to Adventure. Pass `renderer` to `PluginRuntime.make` or
`TestHarness.make` to replace it; a test's fake sender then records the output.

Tagged errors are Schema classes. No error may declare a field named `name`:
that silently replaces `Error.name` and makes every log line print the wrong
value. A package-wide test enforces that rule across the tagged errors this repo
exports.

## Layout

| File               | Contents                                                    |
| ------------------ | ----------------------------------------------------------- |
| `plugin.ts`        | `Plugin()`, the `Plugin` value, and `isPlugin()`            |
| `runtime.ts`       | `PluginRuntime`, start/dispose, and development warning     |
| `clock.ts`         | `TickClock`, tick-driven Effect time                        |
| `events.ts`        | `Events.attach` / `Events.of`, `EventHandle`, and dispatch  |
| `event-bus.ts`     | Listener groups and the host event-bus seam                 |
| `sync-window.ts`   | The `SyncWindow` capability that gates `EventHandle.cancel` |
| `threads.ts`       | `Main`, `AsyncThread`, and the hop seams                    |
| `paper.ts`         | `Paper.on` / `Paper.offload`, the two hops                  |
| `facade.ts`        | The internal `Main` wrapper the façades share               |
| `sender.ts`        | `Sender`, `SenderContext`, and `SenderNotPlayer`            |
| `players.ts`       | `Players.teleport`                                          |
| `worlds.ts`        | `Worlds.blockAt` / `Worlds.setBlock`                        |
| `pdc.ts`           | `Pdc`, Schema-typed keys, and the PDC platform seam         |
| `items.ts`         | `Items.editPdc`, the scoped item PDC handle                 |
| `registry.ts`      | The `Registry` service and its in-memory implementation     |
| `observability.ts` | The swappable `Observability` service and default layer     |
| `renderer.ts`      | The swappable `Renderer` service and default layer          |
| `boundary.ts`      | The command, sync-event, and async-event failure policies   |
| `errors.ts`        | Tagged runtime-state, cancel, and PDC errors                |
