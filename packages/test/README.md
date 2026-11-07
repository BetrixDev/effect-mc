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

| Export                     | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `FakeClock`                | The production `TickClock`; time moves only through `advance` |
| `FakeScheduler`            | Advances a clock and lets woken fibers run                    |
| `makeFakeEventBus`         | The in-memory event bus; `{ development }` selects its policy |
| `makeFakeRegistry`         | An inspectable Registry that records what teardown found      |
| `makeFakeSender`           | A command sender that records rendered messages               |
| `makeFakeCommandRegistrar` | A command registrar that records attached trees               |
| `makeFakePdc`              | An in-memory persistent data container                        |
| `makeFakePdcPlatform`      | Structural PDC keys and type markers for the harness          |

The harness exposes the same instances as `clock`, `scheduler`, `events`,
`registry`, `sender`, `pdc`, `pdcPlatform`, and `commands`. The runtime's `Sender` façade
already reads the fake sender, so `Sender.send` and `Sender.asPlayer` are
testable without a Paper server. `Pdc` reads and writes the harness's fake
container through the fake platform, so typed persistent data is testable the
same way:

```ts
yield * Paper.on(player, Pdc.set(player, Keys.home, home));
```

Pass `worker` to replace the inline `Paper.offload` seam, or `mainThread` to
assert hop targets.

Every failure boundary funnels through the renderer, so rendered output is
observable without a Paper server. `harness.sender.messages()` records what a
failing command or event delivered. Pass `renderer` to replace the default and
assert exactly what the boundary asked it to render:

```ts
import { Renderer } from "@effectmc/core";
import { Layer } from "effect";

const harness = TestHarness.make(plugin, {
  renderer: Layer.succeed(Renderer, { render: () => "rendered by the host" }),
});
```

Pass `observability` to capture the log line and cause; an untagged defect is
logged with its original `Error` (and therefore its stack) rather than a
flattened string.

Commands attach through the runtime too. The harness installs a fake registrar,
so a program that calls `Commands.attach` needs no extra layer:

```ts
await harness.start();

expect(harness.commands.roots().map((root) => root.name)).toEqual(["warp"]);
```

The fake registrar replaces a root when the same label is attached again,
which is the reload behaviour: commands are re-attached, never unregistered
(ADR-0011). Pass `sender: { permissions: ["effectmc.warp"] }` to
`TestHarness.make` when the command tree declares a permission.

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
