import { Context } from "effect";
import { EventThreadingMismatch } from "./errors";

/**
 * Paper's six listener priorities, ordered from first to last dispatched.
 * Compared by their Bukkit slot, so `lowest` runs before `monitor`.
 */
export const eventPriorities = ["lowest", "low", "normal", "high", "highest", "monitor"] as const;

export type EventPriority = (typeof eventPriorities)[number];

/**
 * How an attachment is registered. The mode is explicit because an event
 * class cannot tell you where it will run: `AsyncChatEvent` sometimes fires
 * synchronously (ADR-0012).
 */
export type EventMode = "sync" | "async";

/**
 * The runtime value of a Bukkit event class. Paper's generated declaration for
 * a class `BlockBreakEvent` has `prototype: BlockBreakEvent`, so the instance
 * type is inferred from the class value the author passes.
 */
export interface EventClass<T> {
  readonly prototype: T;
}

/** The subset of `org.bukkit.event.Cancellable` that dispatch needs. */
export interface CancellableEvent {
  isCancelled(): boolean;
  setCancelled(cancel: boolean): void;
}

/**
 * One attachment inside a host listener group. `ignoreCancelled` stays a
 * property of the attachment so two attachments in the same combination may
 * differ; the bus checks the event's cancelled state before each dispatch.
 */
export interface EventListenerRegistration {
  readonly eventClass: EventClass<unknown>;
  readonly eventName: string;
  readonly mode: EventMode;
  readonly priority: EventPriority;
  readonly ignoreCancelled: boolean;
  readonly dispatch: (event: unknown) => void;
}

/**
 * One host-level listener: a single Java `RegisteredListener` per (event type ×
 * priority × mode) combination, fanning out to its attachments (ADR-0023).
 */
export interface EventListener {
  readonly eventClass: EventClass<unknown>;
  readonly eventName: string;
  readonly mode: EventMode;
  readonly priority: EventPriority;
  readonly registrations: ReadonlyArray<EventListenerRegistration>;
}

export interface EventBusService {
  /**
   * Adds an attachment to the matching listener group, creating it if needed.
   * Returns an idempotent removal closure.
   */
  readonly add: (registration: EventListenerRegistration) => () => void;
  /**
   * Dispatches one event to the listener groups attached for its class and
   * actual threading, in priority order. `mode` is the dispatch's threading;
   * when the event exposes `isAsynchronous()`, that value wins. Groups for the
   * other mode are skipped. In development, a dispatch with no group for its
   * actual mode fails loudly (ADR-0012). Newly added or removed attachments do
   * not affect an in-flight dispatch: the matching set is snapshotted first.
   */
  readonly dispatch: (eventClass: EventClass<unknown>, mode: EventMode, event: unknown) => void;
  /** A snapshot of the current listener groups and their attachments. */
  readonly listeners: () => ReadonlyArray<EventListener>;
  /** Empties the bus. Runtime teardown calls this after the scope closes. */
  readonly clear: () => void;
}

/**
 * The host seam behind `Events`. The Paper host implements it with one
 * `RegisteredListener` per combination; tests use {@link makeEventBus}.
 */
export class EventBus extends Context.Service<EventBus, EventBusService>()("effectmc/EventBus") {}

interface MutableEventListener extends EventListener {
  readonly registrations: Array<EventListenerRegistration>;
}

const prioritySlots: Record<EventPriority, number> = {
  lowest: 0,
  low: 1,
  normal: 2,
  high: 3,
  highest: 4,
  monitor: 5,
};

const sameGroup = (
  left: EventListenerRegistration,
  right: Pick<EventListenerRegistration, "eventClass" | "mode" | "priority">,
): boolean =>
  left.eventClass === right.eventClass &&
  left.mode === right.mode &&
  left.priority === right.priority;

const isCancelled = (event: unknown): boolean => {
  const candidate = event as Partial<CancellableEvent>;
  return typeof candidate.isCancelled === "function" && candidate.isCancelled();
};

/**
 * Paper reports the real threading on the event. The explicit mode is only a
 * fallback for fakes and for events that do not carry `isAsynchronous()`.
 */
const eventMode = (event: unknown, fallback: EventMode): EventMode => {
  const candidate = event as Partial<{ isAsynchronous(): boolean }>;
  if (typeof candidate.isAsynchronous === "function") {
    return candidate.isAsynchronous() ? "async" : "sync";
  }
  return fallback;
};

export interface EventBusOptions {
  /**
   * Development buses fail loudly when an attachment's declared mode disagrees
   * with the actual dispatch. Production buses skip the mismatched group so a
   * platform threading change cannot corrupt the world.
   */
  readonly development?: boolean;
}

export const makeEventBus = (options: EventBusOptions = {}): EventBusService => {
  const development = options.development ?? false;
  const listeners: Array<MutableEventListener> = [];

  const findGroup = (registration: EventListenerRegistration) =>
    listeners.find((listener) => sameGroup(registration, listener));

  return {
    add: (registration) => {
      let group = findGroup(registration);
      if (group === undefined) {
        group = {
          eventClass: registration.eventClass,
          eventName: registration.eventName,
          mode: registration.mode,
          priority: registration.priority,
          registrations: [],
        };
        listeners.push(group);
      }
      group.registrations.push(registration);

      return () => {
        const index = group.registrations.indexOf(registration);
        if (index < 0) {
          return;
        }
        group.registrations.splice(index, 1);
        if (group.registrations.length === 0) {
          const listenerIndex = listeners.indexOf(group);
          if (listenerIndex >= 0) {
            listeners.splice(listenerIndex, 1);
          }
        }
      };
    },
    dispatch: (eventClass, mode, event) => {
      const actualMode = eventMode(event, mode);
      const attached = listeners.filter((listener) => listener.eventClass === eventClass);
      const matching = attached
        .filter((listener) => listener.mode === actualMode)
        .sort((left, right) => prioritySlots[left.priority] - prioritySlots[right.priority]);

      const first = attached[0];
      if (development && first !== undefined && matching.length === 0) {
        // No group is prepared for this threading. Attaching both modes is the
        // supported way to handle both branches, so this only fires when the
        // event actually moved to a branch nobody declared (ADR-0012).
        throw new EventThreadingMismatch({
          event: first.eventName,
          declared: first.mode,
          actual: actualMode,
          message:
            `Event '${first.eventName}' was attached in ${first.mode} mode ` +
            `but dispatched on the ${actualMode} thread.`,
        });
      }

      for (const listener of matching) {
        for (const registration of listener.registrations.slice()) {
          if (registration.ignoreCancelled && isCancelled(event)) {
            continue;
          }
          registration.dispatch(event);
        }
      }
    },
    listeners: () =>
      listeners.map((listener) => ({
        eventClass: listener.eventClass,
        eventName: listener.eventName,
        mode: listener.mode,
        priority: listener.priority,
        registrations: listener.registrations.slice(),
      })),
    clear: () => {
      listeners.length = 0;
    },
  };
};
