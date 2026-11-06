/**
 * Compile-time fixtures for the Plugin contract. This file is checked by
 * `tsc --noEmit`; the `@ts-expect-error` disappears if a constraint is lost.
 */
import { Clock, Context, Effect, Layer } from "effect";
import { type AsyncInCancellableHandler } from "./errors";
import { Events, type EventAttachment, type EventHandle, type EventHandler } from "./events";
import { Plugin, type RuntimeServices } from "./plugin";
import { Registry } from "./registry";
import { SyncWindow } from "./sync-window";

class Missing extends Context.Service<Missing, void>()("Missing") {}

class Provided extends Context.Service<Provided, { readonly value: number }>()("Provided") {}

const missingProgram: Effect.Effect<void, never, Missing> = Effect.gen(function* () {
  yield* Missing;
});

// A program may use runtime services without the author wiring a layer.
export const runtimeServices = () =>
  Plugin(
    "uses-runtime",
    Layer.empty,
    Effect.gen(function* () {
      const registry = yield* Registry;
      registry.add({ kind: "task", name: "sweep" });
    }),
  );

// The runtime clock is ambient: reading or sleeping needs no extra requirement.
export const readsRuntimeClock = () =>
  Plugin(
    "clock-reader",
    Layer.empty,
    Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      yield* clock.currentTimeMillis;
      yield* Effect.sleep("1 second");
    }),
  );

// A program may use a service its own layer provides.
export const satisfiedRequirement = () =>
  Plugin(
    "provided",
    Layer.succeed(Provided, { value: 1 }),
    Effect.gen(function* () {
      yield* Provided;
    }),
  );

// @ts-expect-error Missing is not provided by the layer.
export const unsatisfiedRequirement = () => Plugin("missing", Layer.empty, missingProgram);

/** A stand-in for any Paper event class; the class value carries `prototype`. */
class FakeBlockBreakEvent {
  cancelled = false;

  constructor(readonly block: string) {}

  isCancelled(): boolean {
    return this.cancelled;
  }

  setCancelled(cancel: boolean): void {
    this.cancelled = cancel;
  }
}

class FakeChatEvent {
  readonly message = "hello";
}

declare const eventHandle: EventHandle<FakeBlockBreakEvent>;

// Cancelling requires SyncWindow; an effect without it does not typecheck.
// @ts-expect-error SyncWindow is required to cancel.
export const cancelWithoutSyncWindow: Effect.Effect<void, AsyncInCancellableHandler> = eventHandle.cancel;

// With SyncWindow in R, the same value is accepted.
export const cancelWithSyncWindow: Effect.Effect<
  void,
  AsyncInCancellableHandler,
  SyncWindow
> = eventHandle.cancel;

// A sync attachment supplies SyncWindow to the handler, so it can cancel even
// though the program never provides the capability itself.
export const syncAttachment: Effect.Effect<
  EventAttachment,
  AsyncInCancellableHandler,
  RuntimeServices
> = Events.attach(FakeBlockBreakEvent, { mode: "sync", priority: "high" }, (event) =>
  Effect.gen(function* () {
    if (event.block === "stone") {
      yield* event.cancel;
    }
  }),
);

// An async attachment does not get SyncWindow, so cancelling does not
// typecheck (ADR-0010, ADR-0012).
const cancellingHandler: EventHandler<
  FakeBlockBreakEvent,
  AsyncInCancellableHandler,
  SyncWindow
> = (event) =>
  Effect.gen(function* () {
    yield* event.cancel;
  });

export const asyncCancel = () =>
  // @ts-expect-error Async attachments do not receive SyncWindow.
  Events.attach(FakeBlockBreakEvent, { mode: "async" }, cancellingHandler);

declare const chatHandle: EventHandle<FakeChatEvent>;

// A non-cancellable event does not expose `cancel` at all.
// @ts-expect-error FakeChatEvent is not Cancellable.
export const chatCancel: Effect.Effect<void, AsyncInCancellableHandler, SyncWindow> = chatHandle.cancel;

// Reading a non-cancellable event still typechecks.
export const observeChat = () =>
  Events.attach(FakeChatEvent, { mode: "sync" }, (event) =>
    Effect.sync(() => {
      void event.message;
    }),
  );
