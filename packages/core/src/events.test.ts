import { Deferred, Effect, Exit, Layer, Option, Stream } from "effect";
import { expect, test } from "vite-plus/test";
import { AsyncInCancellableHandler } from "./errors";
import { makeEventBus } from "./event-bus";
import { Events, type EventAttachment, type EventHandle } from "./events";
import { Observability } from "./observability";
import { Plugin, type RuntimeServices } from "./plugin";
import { PluginRuntime } from "./runtime";
import { SyncWindow } from "./sync-window";

class BlockBreakEvent {
  cancelled = false;

  constructor(
    readonly player: string,
    readonly block: string,
  ) {}

  isCancelled(): boolean {
    return this.cancelled;
  }

  setCancelled(cancel: boolean): void {
    this.cancelled = cancel;
  }
}

class ChatEvent {
  readonly player = "alex";
  readonly message = "hello";
}

const silentObservability = Layer.succeed(Observability, {
  log: () => Effect.void,
});

const start = async <E>(
  program: Effect.Effect<void, E, RuntimeServices>,
): Promise<PluginRuntime<never, E>> => {
  const runtime = PluginRuntime.make(Plugin("events", Layer.empty, program), {
    development: false,
    observability: silentObservability,
  });
  await runtime.start();
  return runtime;
};

const waitUntil = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not met before the timeout");
};

test("a sync attachment receives the stream element and reads its members", async () => {
  let seen: string | undefined;
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync" }, (event) =>
        Effect.sync(() => {
          seen = `${event.player}:${event.block}`;
        }),
      );
    }),
  );

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));

  expect(seen).toBe("alex:stone");

  await runtime.dispose();
});

test("cancel lands before the dispatch returns", async () => {
  const event = new BlockBreakEvent("alex", "stone");
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync" }, (handle) =>
        Effect.gen(function* () {
          if (handle.block === "stone") {
            yield* handle.cancel;
          }
        }),
      );
    }),
  );

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", event);

  expect(event.isCancelled()).toBe(true);

  await runtime.dispose();
});

test("a cancel after the dispatch fails with AsyncInCancellableHandler", async () => {
  let captured: EventHandle<BlockBreakEvent> | undefined;
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync" }, (handle) =>
        Effect.sync(() => {
          captured = handle;
        }),
      );
    }),
  );

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));
  expect(captured).toBeDefined();

  const exit = Effect.runSyncExit(Effect.provideService(captured!.cancel, SyncWindow, undefined));

  expect(Exit.isFailure(exit)).toBe(true);
  const error = Option.getOrThrow(Exit.findErrorOption(exit));
  expect(error).toBeInstanceOf(AsyncInCancellableHandler);
  expect(error._tag).toBe("AsyncInCancellableHandler");
  expect(error.event).toBe("BlockBreakEvent");
  expect(error.message).toContain("fork");

  await runtime.dispose();
});

test("a fork that cancels later fails with the same error instead of doing nothing", async () => {
  const gate = Deferred.makeUnsafe<void>();
  let resolveObserved!: (exit: Exit.Exit<void, AsyncInCancellableHandler>) => void;
  const observed = new Promise<Exit.Exit<void, AsyncInCancellableHandler>>((resolve) => {
    resolveObserved = resolve;
  });

  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync" }, (handle) =>
        Effect.gen(function* () {
          yield* Effect.forkScoped(
            Deferred.await(gate).pipe(
              Effect.flatMap(() => Effect.exit(handle.cancel)),
              Effect.flatMap((exit) => Effect.sync(() => resolveObserved(exit))),
            ),
          );
        }),
      );
    }),
  );

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));
  Deferred.doneUnsafe(gate, Effect.void);

  const exit = await observed;
  expect(Exit.isFailure(exit)).toBe(true);
  const error = Option.getOrThrow(Exit.findErrorOption(exit));
  expect(error).toBeInstanceOf(AsyncInCancellableHandler);

  await runtime.dispose();
});

test("priority and mode select distinct listeners, and priority orders dispatch", async () => {
  const calls: Array<string> = [];
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync", priority: "high" }, () =>
        Effect.sync(() => {
          calls.push("high");
        }),
      );
      yield* Events.attach(BlockBreakEvent, { mode: "sync", priority: "low" }, () =>
        Effect.sync(() => {
          calls.push("low");
        }),
      );
      yield* Events.attach(ChatEvent, { mode: "async" }, () =>
        Effect.sync(() => {
          calls.push("async-chat");
        }),
      );
    }),
  );

  const registrations = runtime.eventBus.listeners().map((listener) => ({
    eventName: listener.eventName,
    mode: listener.mode,
    priority: listener.priority,
    attachments: listener.registrations.length,
  }));
  expect(registrations).toEqual([
    { eventName: "BlockBreakEvent", mode: "sync", priority: "high", attachments: 1 },
    { eventName: "BlockBreakEvent", mode: "sync", priority: "low", attachments: 1 },
    { eventName: "ChatEvent", mode: "async", priority: "normal", attachments: 1 },
  ]);

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));

  expect(calls).toEqual(["low", "high"]);

  runtime.eventBus.dispatch(ChatEvent, "sync", new ChatEvent());
  expect(calls).toEqual(["low", "high"]);

  await runtime.dispose();
});

test("ignoreCancelled is honored per attachment at dispatch time", async () => {
  const calls: Array<string> = [];
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync", priority: "low" }, (handle) =>
        Effect.gen(function* () {
          calls.push("canceller");
          yield* handle.cancel;
        }),
      );
      yield* Events.attach(
        BlockBreakEvent,
        { mode: "sync", priority: "normal", ignoreCancelled: true },
        () =>
          Effect.sync(() => {
            calls.push("skipped");
          }),
      );
      yield* Events.attach(BlockBreakEvent, { mode: "sync", priority: "normal" }, () =>
        Effect.sync(() => {
          calls.push("observes");
        }),
      );
    }),
  );

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));

  expect(calls).toEqual(["canceller", "observes"]);

  await runtime.dispose();
});

test("detaching removes the listener and its Registry entry", async () => {
  let attachment: EventAttachment | undefined;
  let calls = 0;
  const runtime = await start(
    Effect.gen(function* () {
      attachment = yield* Events.attach(BlockBreakEvent, { mode: "sync" }, () =>
        Effect.sync(() => {
          calls += 1;
        }),
      );
    }),
  );

  expect(runtime.registry.entries()).toEqual([
    { kind: "listener", name: "BlockBreakEvent:sync:normal" },
  ]);

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));
  expect(calls).toBe(1);

  Effect.runSync(attachment!.detach);
  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));

  expect(calls).toBe(1);
  expect(runtime.registry.entries()).toEqual([]);

  Effect.runSync(attachment!.detach);
  expect(runtime.registry.entries()).toEqual([]);

  await runtime.dispose();
});

test("two attachments in the same combination share one listener group", async () => {
  const calls: Array<string> = [];
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync", priority: "high" }, () =>
        Effect.sync(() => {
          calls.push("first");
        }),
      );
      yield* Events.attach(BlockBreakEvent, { mode: "sync", priority: "high" }, () =>
        Effect.sync(() => {
          calls.push("second");
        }),
      );
    }),
  );

  const listeners = runtime.eventBus.listeners();
  expect(listeners).toHaveLength(1);
  expect(listeners[0]?.registrations).toHaveLength(2);

  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));
  expect(calls).toEqual(["first", "second"]);

  await runtime.dispose();
});

test("Events.of yields the stream element and its late cancel fails", async () => {
  let seen: EventHandle<BlockBreakEvent> | undefined;
  const received = Deferred.makeUnsafe<void>();
  const runtime = await start(
    Effect.gen(function* () {
      yield* Effect.forkScoped(
        Events.of(BlockBreakEvent, { mode: "sync", priority: "high" }).pipe(
          Stream.take(1),
          Stream.runForEach((event) =>
            Effect.sync(() => {
              seen = event;
              Deferred.doneUnsafe(received, Effect.void);
            }),
          ),
        ),
      );
    }),
  );

  await waitUntil(() => runtime.eventBus.listeners().length === 1);
  runtime.eventBus.dispatch(BlockBreakEvent, "sync", new BlockBreakEvent("alex", "stone"));
  await Effect.runPromise(Deferred.await(received));

  expect(seen?.player).toBe("alex");
  const exit = Effect.runSyncExit(Effect.provideService(seen!.cancel, SyncWindow, undefined));
  expect(Exit.isFailure(exit)).toBe(true);

  await runtime.dispose();
});

test("accepts a host-provided event bus", async () => {
  const bus = makeEventBus();
  const runtime = PluginRuntime.make(
    Plugin(
      "events",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(BlockBreakEvent, { mode: "sync" }, () => Effect.void);
      }),
    ),
    { development: false, observability: silentObservability, eventBus: bus },
  );

  await runtime.start();

  expect(runtime.eventBus).toBe(bus);
  expect(bus.listeners()).toHaveLength(1);

  await runtime.dispose();
  expect(bus.listeners()).toEqual([]);
});

test("disposing the runtime clears every listener", async () => {
  const runtime = await start(
    Effect.gen(function* () {
      yield* Events.attach(BlockBreakEvent, { mode: "sync" }, () => Effect.void);
    }),
  );

  expect(runtime.eventBus.listeners()).toHaveLength(1);

  await runtime.dispose();

  expect(runtime.eventBus.listeners()).toEqual([]);
});
