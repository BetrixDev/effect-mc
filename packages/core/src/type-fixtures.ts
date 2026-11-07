/**
 * Compile-time fixtures for the Plugin contract. This file is checked by
 * `tsc --noEmit`; the `@ts-expect-error` disappears if a constraint is lost.
 */
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import type {
  AsyncChatEvent,
  Entity,
  ItemStack,
  Location,
  Material,
  PersistentDataHolder,
  Player,
  World,
} from "@effectmc/paper-types";
import {
  type AsyncInCancellableHandler,
  type PdcDecodeError,
  type SenderNotPlayer,
} from "./errors";
import { type EventClass } from "./event-bus";
import { Events, type EventAttachment, type EventHandle, type EventHandler } from "./events";
import { Items } from "./items";
import { Paper } from "./paper";
import { Pdc, type PdcHandle } from "./pdc";
import { Players } from "./players";
import { Plugin, type RuntimeServices } from "./plugin";
import { Registry } from "./registry";
import { Sender, SenderContext } from "./sender";
import { SyncWindow } from "./sync-window";
import { AsyncThread, Main, MainThread, type RegionTarget, Worker } from "./threads";
import { Worlds } from "./worlds";

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
export const cancelWithoutSyncWindow: Effect.Effect<void, AsyncInCancellableHandler> =
  eventHandle.cancel;

// With SyncWindow in R, the same value is accepted.
export const cancelWithSyncWindow: Effect.Effect<void, AsyncInCancellableHandler, SyncWindow> =
  eventHandle.cancel;

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
export const chatCancel: Effect.Effect<void, AsyncInCancellableHandler, SyncWindow> =
  // @ts-expect-error FakeChatEvent is not Cancellable.
  chatHandle.cancel;

// Reading a non-cancellable event still typechecks.
export const observeChat = () =>
  Events.attach(FakeChatEvent, { mode: "sync" }, (event) =>
    Effect.sync(() => {
      void event.message;
    }),
  );

// A sync attachment receives Main from the dispatch, so it can use it without
// the program providing it.
export const syncAttachmentYieldsMain = () =>
  Events.attach(FakeBlockBreakEvent, { mode: "sync" }, () =>
    Effect.gen(function* () {
      yield* Main;
    }),
  );

// An async attachment receives AsyncThread.
export const asyncAttachmentYieldsAsyncThread = () =>
  Events.attach(FakeChatEvent, { mode: "async" }, () =>
    Effect.gen(function* () {
      yield* AsyncThread;
    }),
  );

// A sync attachment does not provide AsyncThread; requiring it stays in R and
// fails at the Plugin boundary.
// @ts-expect-error AsyncThread is not provided in sync mode.
export const syncAttachmentRequiresAsyncThread: Effect.Effect<
  EventAttachment,
  never,
  RuntimeServices
> = Events.attach(FakeChatEvent, { mode: "sync" }, () => AsyncThread);

declare const needsMain: Effect.Effect<void, never, Main>;
declare const regionTarget: RegionTarget;

// A Main-requiring effect cannot be used without a hop.
// @ts-expect-error Main is required.
export const missingMain: Effect.Effect<void> = needsMain;

// A hop through an entity or location replaces Main with the hop seam.
export const hopRemovesMain: Effect.Effect<void, never, MainThread> = Paper.on(
  regionTarget,
  needsMain,
);

// The runtime supplies MainThread, so a hop is satisfied inside a program.
export const hopWithRuntimeServices: Effect.Effect<void, never, RuntimeServices> = Paper.on(
  regionTarget,
  needsMain,
);

// The same hop typechecks inside an async handler.
export const asyncHandlerHops = () =>
  Events.attach(FakeChatEvent, { mode: "async" }, () =>
    Paper.on(
      regionTarget,
      Effect.gen(function* () {
        yield* Main;
        yield* AsyncThread;
      }),
    ),
  );

// An async handler cannot ask for Main directly; it must hop.
const requiringMain: EventHandler<FakeChatEvent, never, Main> = () =>
  Effect.gen(function* () {
    yield* Main;
  });

export const asyncRequiresMain = () =>
  // @ts-expect-error Async attachments do not provide Main.
  Events.attach(FakeChatEvent, { mode: "async" }, requiringMain);

// The mode is explicit, so omitting it does not typecheck (ADR-0012).
export const attachWithoutMode = () =>
  // @ts-expect-error An attachment must declare sync or async.
  Events.attach(FakeChatEvent, {}, () => Effect.void);

// --- The same contract against Paper's pinned typings ---

/** A Paper event class value; attach only reads its prototype type. */
declare const asyncChatEvent: EventClass<AsyncChatEvent>;
declare const player: Player;
declare const entity: Entity;
declare const location: Location;

// An async attachment of Paper's real chat event receives AsyncThread.
export const asyncChatAttachment = () =>
  Events.attach(asyncChatEvent, { mode: "async" }, (event) =>
    Effect.gen(function* () {
      yield* AsyncThread;
      void event.message();
    }),
  );

// AsyncChatEvent is cancellable, but an async attachment gets no SyncWindow,
// so cancelling it does not typecheck (ADR-0010, ADR-0012).
const cancellingChatHandler: EventHandler<AsyncChatEvent, AsyncInCancellableHandler, SyncWindow> = (
  event,
) =>
  Effect.gen(function* () {
    yield* event.cancel;
  });

export const asyncChatCancel = () =>
  // @ts-expect-error Async attachments do not receive SyncWindow.
  Events.attach(asyncChatEvent, { mode: "async" }, cancellingChatHandler);

// The same event attached in sync mode gets Main and the cancel window,
// because AsyncChatEvent sometimes fires synchronously (ADR-0012).
export const syncChatAttachment = () =>
  Events.attach(asyncChatEvent, { mode: "sync" }, (event) =>
    Effect.gen(function* () {
      yield* Main;
      yield* event.cancel;
    }),
  );

// A program may attach the same event type in both modes; each dispatch goes
// to the branch whose declared mode matches its threading (ADR-0012).
export const bothChatModes = () =>
  Effect.gen(function* () {
    yield* Events.attach(asyncChatEvent, { mode: "sync" }, (event) =>
      Effect.sync(() => {
        void event.getPlayer();
      }),
    );
    yield* Events.attach(asyncChatEvent, { mode: "async" }, (event) =>
      Effect.gen(function* () {
        yield* AsyncThread;
        yield* Paper.on(event.getPlayer(), Effect.void);
      }),
    );
  });

// A hop accepts a player, an entity, or a location (ADR-0007).
export const hopThroughPlayer: Effect.Effect<void, never, MainThread> = Paper.on(player, needsMain);

export const hopThroughEntity: Effect.Effect<void, never, MainThread> = Paper.on(entity, needsMain);

export const hopThroughLocation: Effect.Effect<void, never, MainThread> = Paper.on(
  location,
  needsMain,
);

// The hop typechecks inside an async handler and leaves MainThread, which the
// runtime supplies, as its only requirement.
export const asyncChatHandlerHops = () =>
  Events.attach(asyncChatEvent, { mode: "async" }, (event) =>
    Paper.on(
      event.getPlayer(),
      Effect.gen(function* () {
        yield* Main;
        yield* AsyncThread;
      }),
    ),
  );

// --- Façades carry Main ---

declare const world: World;
declare const itemStack: ItemStack;
declare const material: Material;

// Each façade method requires Main, so it cannot be run from async code
// without a hop.
export const teleportRequiresMain: Effect.Effect<boolean, never, Main> = Players.teleport(
  player,
  location,
);

// @ts-expect-error Players.teleport requires Main.
export const teleportWithoutMain: Effect.Effect<boolean> = Players.teleport(player, location);

export const worldWriteRequiresMain: Effect.Effect<void, never, Main> = Worlds.setBlock(
  world,
  location,
  material,
);

// @ts-expect-error Worlds.setBlock requires Main.
export const worldWriteWithoutMain: Effect.Effect<void> = Worlds.setBlock(
  world,
  location,
  material,
);

export const itemPdcRequiresMain: Effect.Effect<string, never, Main> = Items.editPdc(
  itemStack,
  () => "edited",
);

// @ts-expect-error Items.editPdc requires Main.
export const itemPdcWithoutMain: Effect.Effect<string> = Items.editPdc(itemStack, () => "edited");

export const senderSendRequiresMain: Effect.Effect<void, never, SenderContext | Main> =
  Sender.send("hello");

export const senderAsPlayer: Effect.Effect<Player, SenderNotPlayer, SenderContext | Main> =
  Sender.asPlayer;

// Raw Bukkit remains reachable, compiles, and runs; it is simply invisible to
// the thread checker (ADR-0003).
export const rawBukkitTeleport = () => Effect.sync(() => player.teleport(location));

// --- Offload ---

// The offloaded work needs only the Worker seam; the result carries no Main.
export const offloadedValue: Effect.Effect<number, never, Worker> = Paper.offload(() => 1);

const afterOffload: Effect.Effect<void, never, Worker | Main> = Effect.gen(function* () {
  yield* Paper.offload(() => 1);
  yield* Main;
});

// @ts-expect-error Offload resumes without providing Main.
export const offloadDoesNotProvideMain: Effect.Effect<void, never, Worker> = afterOffload;

// --- Schema-typed persistent data ---

const Home = Schema.Struct({
  world: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
});

const Keys = Pdc.namespace("fixtures", {
  home: Home,
  owner: Schema.String,
  count: Schema.Number,
});

declare const holder: PersistentDataHolder;

// A namespace key carries its Schema into the read type.
export const pdcGet: Effect.Effect<
  Option.Option<{ readonly world: string; readonly x: number; readonly y: number }>,
  PdcDecodeError,
  Main
> = Pdc.get(holder, Keys.home);

export const pdcSet = () => Pdc.set(holder, Keys.home, { world: "world", x: 1, y: 2 });

// @ts-expect-error The value must match the key's Schema.
export const pdcSetWrongType = () => Pdc.set(holder, Keys.home, { world: "world", x: "1" });

// Persistent data operations require Main, so they cannot run from async code
// without a hop.
// @ts-expect-error Pdc.get requires Main.
export const pdcGetWithoutMain: Effect.Effect<Option.Option<string>> = Pdc.get(holder, Keys.owner);

// @ts-expect-error Pdc.set requires Main.
export const pdcSetWithoutMain: Effect.Effect<void> = Pdc.set(holder, Keys.owner, "alex");

// Location is not a PersistentDataHolder; a block or location must go through
// its holder (ADR-0014).
// @ts-expect-error Location is not a PersistentDataHolder.
export const pdcGetFromLocation = () => Pdc.get(location, Keys.owner);

// The scoped item handle is typed by the same keys.
export const itemPdcHandle: Effect.Effect<string, never, Main> = Items.editPdc(
  itemStack,
  (pdc: PdcHandle) => {
    pdc.set(Keys.owner, "alex");
    return Option.getOrThrow(pdc.get(Keys.owner));
  },
);

declare const pdcHandle: PdcHandle;

export const pdcHandleSet: void = pdcHandle.set(Keys.count, 1);

// @ts-expect-error The handle is typed by the key's Schema.
export const pdcHandleWrongType = () => pdcHandle.set(Keys.count, "1");
