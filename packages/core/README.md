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

## Layout

| File               | Contents                                                    |
| ------------------ | ----------------------------------------------------------- |
| `plugin.ts`        | `Plugin()`, the `Plugin` value, and `isPlugin()`            |
| `runtime.ts`       | `PluginRuntime`, start/dispose, and development warning     |
| `clock.ts`         | `TickClock`, tick-driven Effect time                        |
| `events.ts`        | `Events.attach` / `Events.of`, `EventHandle`, and dispatch  |
| `event-bus.ts`     | Listener groups and the host event-bus seam                 |
| `sync-window.ts`   | The `SyncWindow` capability that gates `EventHandle.cancel` |
| `threads.ts`       | `Main`, `AsyncThread`, and the `MainThread` hop seam        |
| `paper.ts`         | `Paper.on`, the hop into `Main`                             |
| `registry.ts`      | The `Registry` service and its in-memory implementation     |
| `observability.ts` | The swappable `Observability` service and default layer     |
| `errors.ts`        | Tagged runtime-state and late-cancel errors                 |
