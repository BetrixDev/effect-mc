import { Cause, Effect, Exit, Queue, Stream } from "effect";
import { Boundary } from "./boundary";
import {
  EventBus,
  type CancellableEvent,
  type EventClass,
  type EventListenerRegistration,
  type EventMode,
  type EventPriority,
} from "./event-bus";
import { AsyncInCancellableHandler } from "./errors";
import { Observability, type ObservabilityService } from "./observability";
import { type RuntimeServices } from "./plugin";
import { type Registration, Registry } from "./registry";
import type { Renderer } from "./renderer";
import { SenderContext, type SenderValue } from "./sender";
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
}

type EventOutcome =
  | { readonly _tag: "handled" }
  | { readonly _tag: "rethrow"; readonly cause: Cause.Cause<unknown> };

const handledOutcome: EventOutcome = { _tag: "handled" };

const cancelFailure = (event: string, mode: EventMode): AsyncInCancellableHandler =>
  new AsyncInCancellableHandler({
    event,
    message:
      mode === "async"
        ? `Cancel is not available for the async ${event} dispatch. Hop to Main with Paper.on when the handler needs world access.`
        : `Cancel was called after the synchronous ${event} dispatch returned. ` +
          "If you forked this work, cancel before the handler returns; a fork inherits SyncWindow but not the open window.",
  });

const makeHandle = <T>(
  event: T,
  eventName: string,
  mode: EventMode,
  window: WindowState,
): EventHandle<T> => {
  const cancel: EventCancel = Effect.suspend(() => {
    if (!window.open) {
      return Effect.fail(cancelFailure(eventName, mode));
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

interface HandlerBoundaryOptions {
  readonly eventName: string;
  readonly handlerName: string;
  readonly mode: EventMode;
  readonly development: boolean;
  readonly sender: SenderValue;
  readonly observability: ObservabilityService;
}

/**
 * Runs one handler failure through the boundary for its mode and reduces the
 * answer to what the dispatcher must do. A failure inside the boundary itself
 * is logged rather than allowed to escape into the tick.
 */
const observeHandler = <E>(
  effect: Effect.Effect<void, E, never>,
  options: HandlerBoundaryOptions,
): Effect.Effect<EventOutcome, never, Renderer | Observability> =>
  effect.pipe(
    Effect.as<EventOutcome>(handledOutcome),
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.succeed(handledOutcome);
      }

      const boundary =
        options.mode === "sync"
          ? Boundary.syncEvent(cause, {
              event: options.eventName,
              handler: options.handlerName,
              sender: options.sender,
              development: options.development,
            }).pipe(
              Effect.map((outcome): EventOutcome =>
                outcome === "rethrow" ? { _tag: "rethrow", cause } : handledOutcome,
              ),
            )
          : Boundary.asyncEvent(cause, {
              event: options.eventName,
              handler: options.handlerName,
              sender: options.sender,
            }).pipe(Effect.as<EventOutcome>(handledOutcome));

      return boundary.pipe(
        Effect.catchCause((boundaryCause) =>
          Cause.hasInterruptsOnly(boundaryCause)
            ? Effect.succeed(handledOutcome)
            : options.observability
                .log(
                  "error",
                  `Event handler for ${options.eventName} failed while reporting its failure.`,
                  boundaryCause,
                )
                .pipe(Effect.as(handledOutcome)),
        ),
      );
    }),
  );

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
        Stream.map((event) => makeHandle(event, eventName, registration.mode, { open: false })),
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
    const sender = yield* SenderContext;
    const context = yield* Effect.context<R | RuntimeServices>();

    const eventName = eventTypeName(eventType);
    const handlerName = `${eventName}:${options.mode}:${options.priority ?? "normal"}`;

    const listener = makeRegistration(eventType, eventName, options, (event) => {
      // Only the sync window can cancel. An async handle is never open, even
      // if a cast gets past the type system.
      const window: WindowState = { open: options.mode === "sync" };
      const handle = makeHandle(event as EventInstance<C>, eventName, options.mode, window);
      const handled = handler(handle);

      const effect = (
        options.mode === "sync"
          ? handled.pipe(
              Effect.provideService(SyncWindow, undefined),
              Effect.provideService(Main, { region: undefined }),
            )
          : handled.pipe(Effect.provideService(AsyncThread, undefined))
      ) as Effect.Effect<void, E, never>;

      // The boundary decides what a failure means per mode: tagged errors
      // render and log, while an untagged sync defect is rethrown in
      // development (ADR-0005).
      const observed = observeHandler(effect, {
        eventName,
        handlerName,
        mode: options.mode,
        development: bus.development,
        sender,
        observability,
      });

      if (options.mode === "sync") {
        let exit: Exit.Exit<EventOutcome>;
        try {
          exit = Effect.runSyncExitWith(context)(observed);
        } finally {
          window.open = false;
        }

        if (Exit.isFailure(exit)) {
          Effect.runSync(
            observability.log(
              "error",
              `Event handler for ${eventName} failed while reporting its failure.`,
              exit.cause,
            ),
          );
          return;
        }

        if (exit.value._tag === "rethrow") {
          throw Cause.squash(exit.value.cause);
        }
        return;
      }

      // Scoped so runtime teardown interrupts an in-flight async handler.
      Effect.runForkWith(context)(Effect.forkScoped(observed));
    });

    const removeListener = bus.add(listener);
    const registration: Registration = {
      kind: "listener",
      name: handlerName,
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
