import { Deferred, Effect, Exit, Layer, Option } from "effect";
import { expect, test } from "vite-plus/test";
import {
  AsyncInCancellableHandler,
  AsyncThread,
  type EventHandle,
  EventThreadingMismatch,
  Events,
  Main,
  type MainThreadService,
  Paper,
  Plugin,
  type RegionTarget,
  SyncWindow,
} from "@effectmc/core";
import { TestHarness } from "./harness";

/**
 * An event with the two members dispatch reads: a threading hint and the
 * cancellable surface. `isAsynchronous` is deliberately per instance because
 * Paper can fire the same event class on either thread (ADR-0012).
 */
class ChatEvent {
  private cancelled = false;

  constructor(
    readonly message: string,
    private readonly asynchronous = false,
  ) {}

  isAsynchronous(): boolean {
    return this.asynchronous;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  setCancelled(cancel: boolean): void {
    this.cancelled = cancel;
  }
}

test("an async attachment receives AsyncThread and its handle has no usable cancel", async () => {
  let sawAsyncThread = false;
  let captured: EventHandle<ChatEvent> | undefined;
  const completed = Deferred.makeUnsafe<void>();

  const harness = TestHarness.make(
    Plugin(
      "async",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "async" }, (event) =>
          Effect.gen(function* () {
            yield* AsyncThread;
            sawAsyncThread = true;
            captured = event;
            Deferred.doneUnsafe(completed, Effect.void);
          }),
        );
      }),
    ),
    { development: false },
  );

  await harness.start();
  harness.events.dispatch(ChatEvent, new ChatEvent("hello", true));
  await Effect.runPromise(Deferred.await(completed));

  expect(sawAsyncThread).toBe(true);
  expect(captured).toBeDefined();

  const exit = Effect.runSyncExit(Effect.provideService(captured!.cancel, SyncWindow, undefined));

  expect(Exit.isFailure(exit)).toBe(true);
  const error = Option.getOrThrow(Exit.findErrorOption(exit));
  expect(error).toBeInstanceOf(AsyncInCancellableHandler);
  expect(error.message).toContain("async");

  await harness.teardown();
});

test("an async handler hops to Main through the player", async () => {
  const player = { name: "alex" } as unknown as RegionTarget;
  const hops: Array<RegionTarget> = [];
  const mainThread: MainThreadService = {
    run: (target, effect) =>
      Effect.sync(() => {
        hops.push(target);
      }).pipe(Effect.flatMap(() => effect)),
  };

  let region: RegionTarget | undefined;
  let sawAsyncThread = false;
  const completed = Deferred.makeUnsafe<void>();

  const harness = TestHarness.make(
    Plugin(
      "hop",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "async" }, () =>
          Effect.gen(function* () {
            yield* AsyncThread;
            sawAsyncThread = true;

            yield* Paper.on(
              player,
              Effect.gen(function* () {
                region = (yield* Main).region;
                Deferred.doneUnsafe(completed, Effect.void);
              }),
            );
          }),
        );
      }),
    ),
    { development: false, mainThread },
  );

  await harness.start();
  harness.events.dispatch(ChatEvent, new ChatEvent("hello", true));
  await Effect.runPromise(Deferred.await(completed));

  expect(sawAsyncThread).toBe(true);
  expect(hops).toEqual([player]);
  expect(region).toBe(player);

  await harness.teardown();
});

test("a development harness fails loudly when the dispatch disagrees with the mode", async () => {
  const harness = TestHarness.make(
    Plugin(
      "mismatch",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "async" }, () => Effect.void);
      }),
    ),
    { development: true },
  );

  await harness.start();

  expect(() => harness.events.dispatch(ChatEvent, new ChatEvent("hello"))).toThrow(
    EventThreadingMismatch,
  );

  await harness.teardown();
});

test("a production harness skips the group whose mode does not match the dispatch", async () => {
  const harness = TestHarness.make(
    Plugin(
      "mismatch",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "async" }, () => Effect.void);
      }),
    ),
    { development: false },
  );

  await harness.start();

  expect(() => harness.events.dispatch(ChatEvent, new ChatEvent("hello"))).not.toThrow();

  await harness.teardown();
});

test("two attachments of the same event type in different modes both work", async () => {
  const calls: Array<string> = [];
  const asyncCompleted = Deferred.makeUnsafe<void>();

  const harness = TestHarness.make(
    Plugin(
      "both-modes",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(ChatEvent, { mode: "sync" }, () =>
          Effect.sync(() => {
            calls.push("sync");
          }),
        );
        yield* Events.attach(ChatEvent, { mode: "async" }, () =>
          Effect.sync(() => {
            calls.push("async");
            Deferred.doneUnsafe(asyncCompleted, Effect.void);
          }),
        );
      }),
    ),
    { development: true },
  );

  await harness.start();

  expect(harness.registry.entries()).toEqual([
    { kind: "listener", name: "ChatEvent:sync:normal" },
    { kind: "listener", name: "ChatEvent:async:normal" },
  ]);

  // The declared mode is checked against the event's own threading, so a
  // development harness with both branches attached never fails.
  harness.events.dispatch(ChatEvent, new ChatEvent("hello"));
  expect(calls).toEqual(["sync"]);

  harness.events.dispatch(ChatEvent, new ChatEvent("hello", true));
  await Effect.runPromise(Deferred.await(asyncCompleted));
  expect(calls).toEqual(["sync", "async"]);

  await harness.teardown();
  expect(harness.registry.entries()).toEqual([]);
});
