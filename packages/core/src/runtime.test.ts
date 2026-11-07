import { Context, Deferred, Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import { TICK_MILLIS, TickClock } from "./clock";
import { RuntimeStateError } from "./errors";
import { Observability, type ObservabilityLevel } from "./observability";
import { Plugin } from "./plugin";
import { makeRegistry, Registry } from "./registry";
import { PluginRuntime, type PluginRuntimeOptions } from "./runtime";

class Greeting extends Context.Service<Greeting, { readonly text: string }>()("Greeting") {}

interface LogRecord {
  readonly level: ObservabilityLevel;
  readonly message: string;
}

const silentObservability = Layer.succeed(Observability, {
  log: () => Effect.void,
});

const recordingObservability = (logs: Array<LogRecord>) =>
  Layer.succeed(Observability, {
    log: (level, message) => Effect.sync(() => logs.push({ level, message })),
  });

const options = (overrides: PluginRuntimeOptions = {}): PluginRuntimeOptions => ({
  development: false,
  observability: silentObservability,
  ...overrides,
});

// Longer than the test timeout: a sleep that falls back to live time cannot
// make these tests pass.
const LONG_SLEEP_MILLIS = 30_000;
const LONG_SLEEP_TICKS = LONG_SLEEP_MILLIS / TICK_MILLIS;

test("runs the program to completion and records what it attached", async () => {
  const plugin = Plugin(
    "demo",
    Layer.succeed(Greeting, { text: "hello" }),
    Effect.gen(function* () {
      const greeting = yield* Greeting;
      const registry = yield* Registry;
      registry.add({ kind: "task", name: greeting.text });
    }),
  );

  const runtime = PluginRuntime.make(plugin, options());
  await runtime.start();

  expect(runtime.status).toBe("running");
  expect(runtime.registry.entries()).toEqual([{ kind: "task", name: "hello" }]);

  await runtime.dispose();

  expect(runtime.status).toBe("disposed");
  expect(runtime.registry.entries()).toEqual([]);
});

test("drives a plugin's sleep from the supplied runtime tick clock", async () => {
  const clock = new TickClock();
  const sleeping = Deferred.makeUnsafe<void>();
  const runtime = PluginRuntime.make(
    Plugin(
      "clocked",
      Layer.empty,
      Effect.gen(function* () {
        Deferred.doneUnsafe(sleeping, Effect.void);
        yield* Effect.sleep(`${LONG_SLEEP_MILLIS} millis`);
        const registry = yield* Registry;
        registry.add({ kind: "task", name: "woke" });
      }),
    ),
    options({ clock }),
  );

  expect(runtime.clock).toBe(clock);

  const starting = runtime.start();
  await Effect.runPromise(Deferred.await(sleeping));

  runtime.clock.advance(LONG_SLEEP_TICKS / 2);
  await Effect.runPromise(Effect.yieldNow);
  expect(runtime.registry.entries()).toEqual([]);

  runtime.clock.advance(LONG_SLEEP_TICKS / 2);
  await starting;

  expect(runtime.registry.entries()).toEqual([{ kind: "task", name: "woke" }]);

  await runtime.dispose();
});

test("drives scoped attach work from the same runtime tick clock", async () => {
  const sleeping = Deferred.makeUnsafe<void>();
  const woke = Deferred.makeUnsafe<void>();
  const runtime = PluginRuntime.make(
    Plugin(
      "clocked-attach",
      Layer.empty,
      Effect.gen(function* () {
        yield* Effect.forkScoped(
          Effect.gen(function* () {
            Deferred.doneUnsafe(sleeping, Effect.void);
            yield* Effect.sleep(`${LONG_SLEEP_MILLIS} millis`);
            const registry = yield* Registry;
            registry.add({ kind: "task", name: "slept" });
            Deferred.doneUnsafe(woke, Effect.void);
          }),
        );
      }),
    ),
    options(),
  );

  await runtime.start();
  await Effect.runPromise(Deferred.await(sleeping));
  expect(runtime.registry.entries()).toEqual([]);

  runtime.clock.advance(LONG_SLEEP_TICKS);
  await Effect.runPromise(Deferred.await(woke));

  expect(runtime.registry.entries()).toEqual([{ kind: "task", name: "slept" }]);

  await runtime.dispose();
});

test("keeps scoped attach work alive until teardown interrupts it", async () => {
  let interrupted = false;
  const plugin = Plugin(
    "demo",
    Layer.empty,
    Effect.gen(function* () {
      yield* Effect.forkScoped(
        Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true;
            }),
          ),
        ),
      );
      yield* Effect.yieldNow;
    }),
  );

  const runtime = PluginRuntime.make(plugin, options());
  await runtime.start();

  expect(interrupted).toBe(false);

  await runtime.dispose();

  expect(interrupted).toBe(true);
});

test("warns in development without interrupting a program that outlives the warning window", async () => {
  const logs: Array<LogRecord> = [];
  const started = Deferred.makeUnsafe<void>();
  const gate = Deferred.makeUnsafe<void>();
  const finished = Deferred.makeUnsafe<void>();
  const runtime = PluginRuntime.make(
    Plugin(
      "slow",
      Layer.empty,
      Effect.gen(function* () {
        Deferred.doneUnsafe(started, Effect.void);
        yield* Deferred.await(gate);
        const registry = yield* Registry;
        registry.add({ kind: "task", name: "late" });
        Deferred.doneUnsafe(finished, Effect.void);
      }),
    ),
    options({
      development: true,
      programTimeout: `${LONG_SLEEP_MILLIS} millis`,
      observability: recordingObservability(logs),
    }),
  );

  const starting = runtime.start();
  await Effect.runPromise(Deferred.await(started));
  await Effect.runPromise(Effect.yieldNow);
  expect(logs).toEqual([]);

  runtime.clock.advance(LONG_SLEEP_TICKS / 2);
  await Effect.runPromise(Effect.yieldNow);
  expect(logs).toEqual([]);

  runtime.clock.advance(LONG_SLEEP_TICKS / 2 + 100);
  await starting;

  expect(runtime.status).toBe("running");
  expect(logs).toHaveLength(1);
  expect(logs[0]?.level).toBe("warning");
  expect(logs[0]?.message).toContain("slow");
  expect(logs[0]?.message).toContain("did not complete");
  expect(runtime.registry.entries()).toEqual([]);

  Deferred.doneUnsafe(gate, Effect.void);
  await Effect.runPromise(Deferred.await(finished));

  expect(runtime.registry.entries()).toEqual([{ kind: "task", name: "late" }]);

  await runtime.dispose();
});

test("does not warn in development when the program completes", async () => {
  const logs: Array<LogRecord> = [];
  const runtime = PluginRuntime.make(
    Plugin("quick", Layer.empty, Effect.void),
    options({
      development: true,
      programTimeout: "10 millis",
      observability: recordingObservability(logs),
    }),
  );

  await runtime.start();

  expect(logs).toEqual([]);

  await runtime.dispose();
});

test("surfaces a failing program and leaves the registry empty", async () => {
  const runtime = PluginRuntime.make(
    Plugin(
      "bad",
      Layer.empty,
      Effect.gen(function* () {
        const registry = yield* Registry;
        registry.add({ kind: "task", name: "partial" });
        return yield* Effect.fail(new Error("boom"));
      }),
    ),
    options(),
  );

  await expect(runtime.start()).rejects.toThrow("boom");

  expect(runtime.status).toBe("failed");
  expect(runtime.registry.entries()).toEqual([]);

  await runtime.dispose();
  expect(runtime.status).toBe("disposed");
});

test("disposal is terminal and a restart constructs a new runtime", async () => {
  const plugin = Plugin("demo", Layer.empty, Effect.void);
  const runtime = PluginRuntime.make(plugin, options());

  await runtime.start();
  await expect(runtime.start()).rejects.toBeInstanceOf(RuntimeStateError);

  await runtime.dispose();
  await runtime.dispose();

  expect(runtime.disposed).toBe(true);
  await expect(runtime.start()).rejects.toMatchObject({
    _tag: "RuntimeStateError",
    state: "disposed",
  });

  const restarted = PluginRuntime.make(plugin, options());
  await restarted.start();

  expect(restarted.status).toBe("running");
  expect(restarted).not.toBe(runtime);

  await restarted.dispose();
});

test("can dispose a runtime whose program is still starting", async () => {
  const runtime = PluginRuntime.make(
    Plugin("stuck", Layer.empty, Effect.never),
    options({ development: true, programTimeout: "10 seconds" }),
  );

  const starting = runtime.start();
  const disposal = runtime.dispose();

  await starting.catch(() => undefined);
  await disposal;

  expect(runtime.status).toBe("disposed");
  expect(runtime.registry.entries()).toEqual([]);
});

test("accepts a host-provided registry and exposes the same instance", async () => {
  const registry = makeRegistry();
  const runtime = PluginRuntime.make(
    Plugin(
      "demo",
      Layer.empty,
      Effect.gen(function* () {
        const current = yield* Registry;
        current.add({ kind: "task", name: "sweep" });
      }),
    ),
    options({ registry }),
  );

  await runtime.start();

  expect(runtime.registry).toBe(registry);
  expect(registry.entries()).toEqual([{ kind: "task", name: "sweep" }]);

  await runtime.dispose();

  expect(registry.entries()).toEqual([]);
});

test("provides the swappable observability layer to the program", async () => {
  const logs: Array<LogRecord> = [];
  const runtime = PluginRuntime.make(
    Plugin(
      "demo",
      Layer.empty,
      Observability.use((observability) => observability.log("info", "hello")),
    ),
    options({ observability: recordingObservability(logs) }),
  );

  await runtime.start();

  expect(logs).toEqual([{ level: "info", message: "hello" }]);

  await runtime.dispose();
});

const ExtraService = Context.Reference<{ readonly value: string }>("RuntimeTest/Extra", {
  defaultValue: () => ({ value: "default" }),
});

const recordsExtra = (name: string) =>
  Plugin(
    name,
    Layer.empty,
    Effect.gen(function* () {
      const extra = yield* ExtraService;
      const registry = yield* Registry;
      registry.add({ kind: "task", name: extra.value });
    }),
  );

test("merges host services without adding them to the program's requirements", async () => {
  const defaultRuntime = PluginRuntime.make(recordsExtra("default"), options());
  await defaultRuntime.start();
  expect(defaultRuntime.registry.entries()).toEqual([{ kind: "task", name: "default" }]);
  await defaultRuntime.dispose();

  const hostRuntime = PluginRuntime.make(
    recordsExtra("host"),
    options({ hostServices: Layer.succeed(ExtraService, { value: "host" }) }),
  );
  await hostRuntime.start();
  expect(hostRuntime.registry.entries()).toEqual([{ kind: "task", name: "host" }]);
  await hostRuntime.dispose();
});
