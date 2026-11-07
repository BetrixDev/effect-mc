# @effectmc/test

Fakes plus a harness that runs a plugin program to completion without a Paper
installation (ADR-0021).

```ts
import { Effect, Layer } from "effect";
import { Events, Plugin } from "@effectmc/core";
import { TestHarness } from "@effectmc/test";

const harness = TestHarness.make(
  Plugin(
    "demo",
    Layer.empty,
    Effect.gen(function* () {
      yield* Events.attach(SomeEvent, { mode: "sync" }, handler);
    }),
  ),
);

await harness.start();

expect(harness.registry.entries()).toEqual([{ kind: "listener", name: "SomeEvent:sync:normal" }]);

await harness.teardown();

expect(harness.registry.entries()).toEqual([]);
```

`start` fails with `ProgramDidNotComplete` when the program is still running at
its deadline (one second by default). `teardown` fails with
`LeakedRegistrations` when the Registry still held entries at the moment
teardown cleared it. That makes a leaked registration a failing test rather
than something the runtime's safety clear hides.

The assertion is strict on purpose: registrations must come from a scoped
attach verb, because that is what detaches them. A bare `registry.add` is not
lifetime-managed and is reported as a leak.

## Fakes

| Export             | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `FakeClock`        | The production `TickClock`; time moves only through `advance` |
| `FakeScheduler`    | Advances a clock and lets woken fibers run                    |
| `makeFakeEventBus` | The in-memory event bus; `{ development }` selects its policy |
| `makeFakeRegistry` | An inspectable Registry that records what teardown found      |
| `makeFakeSender`   | A command sender that records rendered messages               |
| `makeFakePdc`      | An in-memory persistent data container                        |

The harness exposes the same instances as `clock`, `scheduler`, `events`,
`registry`, `sender`, and `pdc`. The runtime's `Sender` façade already reads
the fake sender, so `Sender.send` and `Sender.asPlayer` are testable without a
Paper server; `pdc` stays a standalone fake until the `Pdc` façade lands. Pass
`worker` to replace the inline `Paper.offload` seam, or `mainThread` to assert
hop targets.

`events` is the bus the runtime created, so the harness inherits the runtime's
development policy. With `development: true` (or `NODE_ENV` set to
`development`/`test`), dispatching an event whose `isAsynchronous()` disagrees
with the attachment's declared mode throws `EventThreadingMismatch`; production
skips the mismatched group instead. A standalone `makeFakeEventBus` takes the
same `{ development }` option and is production-shaped by default.

```ts
const harness = TestHarness.make(plugin, { development: true });

await harness.start();

// ChatEvent carries isAsynchronous(); true dispatches to the async branch.
harness.events.dispatch(ChatEvent, new ChatEvent("hello", true));
```

Scheduled work and sleeps use the harness clock, so tests advance time
explicitly:

```ts
const starting = harness.start();
await harness.advance(2); // 100 ms
await starting;
```
