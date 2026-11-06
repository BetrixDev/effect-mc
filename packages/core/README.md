# @effectmc/core

The plugin entry point, runtime, tick-driven clock, Registry, and observability
seam.

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

A program whose requirements its Layer does not satisfy is a compile error.
Development runtimes warn instead of hanging when a program does not complete;
the warning window is server time too. Pass `observability` to
`PluginRuntime.make` to replace the default console layer.

## Layout

| File               | Contents                                                |
| ------------------ | ------------------------------------------------------- |
| `plugin.ts`        | `Plugin()`, the `Plugin` value, and `isPlugin()`        |
| `runtime.ts`       | `PluginRuntime`, start/dispose, and development warning |
| `clock.ts`         | `TickClock`, tick-driven Effect time                    |
| `registry.ts`      | The `Registry` service and its in-memory implementation |
| `observability.ts` | The swappable `Observability` service and default layer |
| `errors.ts`        | Tagged runtime-state errors                             |
