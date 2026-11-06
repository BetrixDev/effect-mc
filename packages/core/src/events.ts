import { Effect, Exit, Queue, Stream } from "effect";
import {
  EventBus,
  type CancellableEvent,
  type EventClass,
  type EventListenerRegistration,
  type EventMode,
  type EventPriority,
} from "./event-bus";
import { AsyncInCancellableHandler } from "./errors";
import { Observability } from "./observability";
import { type RuntimeServices } from "./plugin";
import { type Registration, Registry } from "./registry";
import { SyncWindow } from "./sync-window";
import { AsyncThread, Main } from "./threads";

export interface EventAttachOptions {
  readonly mode: EventMode;
  /** Defaults to `normal`, the Bukkit default. */
  readonly priority?: EventPriority;
  /** Defaults to `false`, the Bukkit default. */
  readonly ignoreCancelled?: boolean;
}

/**
 * Options for the read path. A stream is identified by the same combination as
 * an attachment: event type, priority and mode (ADR-0023).
 */
export interface EventStreamOptions {
  /** Defaults to `sync`. */
  readonly mode?: EventMode;
  /** Defaults to `normal`. */
  readonly priority?: EventPriority;
  /** Defaults to `false`. */
  readonly ignoreCancelled?: boolean;
}

type EventInstance<C> = C extends EventClass<infer T> ? T : never;

/** The capability-gated cancel effect an event handle exposes when it can be cancelled. */
export type EventCancel = Effect.Effect<void, AsyncInCancellableHandler, SyncWindow>;

/**
 * The element an event stream yields: the Bukkit event plus a `cancel` effect
 * when the event is cancellable. It is written as an intersection so authors
 * can read event members directly, as the design pages show, while
 * cancellation carries its own capability.
 */
export type EventHandle<T> = T &
  (T extends CancellableEvent ? { readonly cancel: EventCancel } : unknown);

export type EventHandler<T, E = never, R = never> = (
  event: EventHandle<T>,
) => Effect.Effect<void, E, R>;

/**
 * The handle `Events.attach` returns. Detaching removes the listener from the
 * host and from the Registry; it is safe to call more than once.
 */
export interface EventAttachment {
  readonly detach: Effect.Effect<void>;
}

const eventTypeName = (eventType: EventClass<unknown>): string => {
  const candidate = eventType as {
    readonly name?: unknown;
    readonly getSimpleName?: () => string;
    readonly getName?: () => string;
  };

  if (typeof candidate.name === "string" && candidate.name.length > 0) {
    return candidate.name;
  }
  if (typeof candidate.getSimpleName === "function") {
    return candidate.getSimpleName();
  }
  if (typeof candidate.getName === "function") {
    return candidate.getName();
  }
  throw new TypeError(
    "An event type must expose a name, getSimpleName(), or getName() so it can be registered.",
  );
};

const makeRegistration = (
  eventClass: EventClass<unknown>,
  eventName: string,
  options: EventStreamOptions,
  dispatch: (event: unknown) => void,
): EventListenerRegistration => ({
  eventClass,
  eventName,
  mode: options.mode ?? "sync",
  priority: options.priority ?? "normal",
  ignoreCancelled: options.ignoreCancelled ?? false,
  dispatch,
});

interface WindowState {
  open: boolean;
  mode: EventMode;
}

const cancelFailure = (event: string, mode: EventMode): AsyncInCancellableHandler =>
  new AsyncInCancellableHandler({
    event,
    message:
      mode === "async"
        ? `Cancel is not available for the async ${event} dispatch. Hop to Main with Paper.on when the handler needs world access.`
        : `Cancel was called after the synchronous ${event} dispatch returned. ` +
          "If you forked this work, cancel before the handler returns; a fork inherits SyncWindow but not the open window.",
  });

const makeHandle = <T>(event: T, eventName: string, window: WindowState): EventHandle<T> => {
  const cancel: EventCancel = Effect.suspend(() => {
    if (!window.open) {
      return Effect.fail(cancelFailure(eventName, window.mode));
    }

    return Effect.sync(() => {
      const cancellable = event as Partial<CancellableEvent>;
      if (typeof cancellable.setCancelled !== "function") {
        throw new TypeError(
          `Event '${eventName}' cannot be cancelled because it is not a Cancellable event.`,
        );
      }
      cancellable.setCancelled(true);
    });
  });

  return new Proxy(event as object, {
    get(target, property, receiver) {
      if (property === "cancel") {
        return cancel;
      }
      return Reflect.get(target, property, receiver);
    },
  }) as EventHandle<T>;
};

/**
 * Reads events without attaching a handler. The returned stream is identified
 * by the same event type × priority × mode combination as an attachment.
 *
 * Delivery happens after the Java listener returns, so the element is a
 * snapshot and its `cancel` no longer lands. Use `Events.attach` when the
 * handler must cancel inside the window (ADR-0008).
 */
export function of<C extends EventClass<unknown>>(
  eventType: C,
  options: EventStreamOptions = {},
): Stream.Stream<EventHandle<EventInstance<C>>, never, EventBus> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const bus = yield* EventBus;
      const queue = yield* Queue.unbounded<EventInstance<C>>();
      const eventName = eventTypeName(eventType);

      const registration = makeRegistration(eventType, eventName, options, (event) => {
        Queue.offerUnsafe(queue, event as EventInstance<C>);
      });
      const removeListener = bus.add(registration);
      yield* Effect.addFinalizer(() => Effect.sync(removeListener));

      return Stream.fromQueue(queue).pipe(
        Stream.map((event) =>
          makeHandle(event, eventName, { open: false, mode: registration.mode }),
        ),
      );
    }),
  );
}

/**
 * Attaches a handler to a Bukkit event. Registration is scoped to the plugin
 * runtime: teardown detaches it, and the returned handle can detach earlier.
 *
 * A sync handler runs through `runSyncExit` before the Java listener returns,
 * receives `Main` and `SyncWindow`, and can cancel while the window is open.
 * An async handler is forked with `AsyncThread`, has no cancel, and must hop
 * with `Paper.on` to touch the world (ADR-0012).
 */
export function attach<C extends EventClass<unknown>, E, R>(
  eventType: C,
  options: EventAttachOptions & { readonly mode: "sync" },
  handler: EventHandler<EventInstance<C>, E, R>,
): Effect.Effect<EventAttachment, E, Exclude<R, SyncWindow | Main> | RuntimeServices>;

export function attach<C extends EventClass<unknown>, E, R>(
  eventType: C,
  options: EventAttachOptions & { readonly mode: "async" },
  handler: EventHandler<EventInstance<C>, E, Exclude<R, SyncWindow | Main>>,
): Effect.Effect<EventAttachment, E, Exclude<R, AsyncThread> | RuntimeServices>;

export function attach<C extends EventClass<unknown>, E, R>(
  eventType: C,
  options: EventAttachOptions,
  handler: EventHandler<EventInstance<C>, E, R>,
): Effect.Effect<EventAttachment, E, R | RuntimeServices> {
  return Effect.gen(function* () {
    const registry = yield* Registry;
    const bus = yield* EventBus;
    const observability = yield* Observability;
    const context = yield* Effect.context<R | RuntimeServices>();

    const eventName = eventTypeName(eventType);

    const listener = makeRegistration(eventType, eventName, options, (event) => {
      // Only the sync window can cancel. An async handle is never open, even
      // if a cast gets past the type system.
      const window: WindowState = { open: options.mode === "sync", mode: options.mode };
      const handle = makeHandle(event as EventInstance<C>, eventName, window);
      const handled = handler(handle);

      if (options.mode === "sync") {
        const effect = handled.pipe(
          Effect.provideService(SyncWindow, undefined),
          Effect.provideService(Main, { region: undefined }),
        ) as Effect.Effect<void, E>;

        let exit: Exit.Exit<void, E>;
        try {
          exit = Effect.runSyncExitWith(context)(effect);
        } finally {
          window.open = false;
        }

        if (Exit.isFailure(exit)) {
          Effect.runSync(
            observability.log("error", `Event handler for ${eventName} failed.`, exit.cause),
          );
        }
        return;
      }

      const effect = handled.pipe(Effect.provideService(AsyncThread, undefined)) as Effect.Effect<
        void,
        E,
        never
      >;
      const observed = effect.pipe(
        Effect.catchCause((cause) =>
          observability.log("error", `Async event handler for ${eventName} failed.`, cause),
        ),
      );
      Effect.runForkWith(context)(observed);
    });

    const removeListener = bus.add(listener);
    const registration: Registration = {
      kind: "listener",
      name: `${eventName}:${listener.mode}:${listener.priority}`,
    };
    const removeRegistration = registry.add(registration);

    const detach = () => {
      removeListener();
      removeRegistration();
    };
    yield* Effect.addFinalizer(() => Effect.sync(detach));

    return {
      detach: Effect.sync(detach),
    };
  });
}

/**
 * The event author surface. `attach` is the only registration verb; `of` is
 * the read path (ADR-0004).
 */
export const Events = {
  attach,
  of,
};
