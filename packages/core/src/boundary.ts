import { Cause, Effect } from "effect";
import { Observability } from "./observability";
import { isTaggedFailure, Renderer, fallbackRenderMessage, type TaggedFailure } from "./renderer";
import type { SenderValue } from "./sender";

export interface CommandBoundaryOptions {
  /** The sender a rendered failure is delivered to. */
  readonly sender: SenderValue;
  /** The command name, used only to identify the failure in the log. */
  readonly command: string;
}

export interface EventBoundaryOptions {
  /** The event type's name, used in the log line. */
  readonly event: string;
  /**
   * The attachment's identity, such as `ChatEvent:sync:normal`. Logging it is
   * what makes a swallowed failure traceable in production (ADR-0005).
   */
  readonly handler?: string;
  /** The sender a rendered failure is delivered to. */
  readonly sender: SenderValue;
  /** Development runtimes fail loud on an untagged sync-event defect. */
  readonly development?: boolean;
}

/** What the sync-event boundary wants the dispatcher to do next. */
export type SyncEventOutcome = "handled" | "rethrow";

interface FailureSummary {
  readonly tagged: TaggedFailure | undefined;
  readonly untagged: unknown;
  readonly hasUntagged: boolean;
}

/** Splits a cause into the tagged failure a boundary renders and the defect it logs. */
const summarize = (cause: Cause.Cause<unknown>): FailureSummary => {
  let tagged: TaggedFailure | undefined;
  let untagged: unknown;
  let hasUntagged = false;

  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) {
      if (isTaggedFailure(reason.error)) {
        tagged ??= reason.error;
      } else if (!hasUntagged) {
        hasUntagged = true;
        untagged = reason.error;
      }
    } else if (Cause.isDieReason(reason) && !hasUntagged) {
      hasUntagged = true;
      untagged = reason.defect;
    }
  }

  return { tagged, untagged, hasUntagged };
};

const logLine = (kind: string, subject: string, summary: FailureSummary): string =>
  summary.tagged === undefined
    ? `${kind} '${subject}' failed.`
    : `${kind} '${subject}' failed with ${summary.tagged._tag}.`;

/**
 * Renders one failure and delivers it. A broken renderer or a sender that
 * cannot accept output is itself logged rather than allowed to take down the
 * boundary (ADR-0005: a failing command must not take down the tick).
 */
const deliver = (
  failure: unknown,
  sender: SenderValue,
): Effect.Effect<void, never, Renderer | Observability> =>
  Effect.gen(function* () {
    const renderer = yield* Renderer;
    const observability = yield* Observability;

    const message = yield* Effect.sync(() => renderer.render(failure)).pipe(
      Effect.catchCause((cause) =>
        observability
          .log("error", "The error renderer failed; using the fallback message.", cause)
          .pipe(Effect.as(fallbackRenderMessage)),
      ),
    );

    yield* Effect.sync(() => sender.send(message)).pipe(
      Effect.catchCause((cause) =>
        observability.log("error", "Failed to deliver a rendered error to the sender.", cause),
      ),
    );
  });

/**
 * The command boundary. Tagged failures render to the command's sender;
 * untagged defects are logged with their stack. The returned effect never
 * fails, so one bad command cannot take down the tick (ADR-0005).
 */
export const command = <E, R>(
  effect: Effect.Effect<void, E, R>,
  options: CommandBoundaryOptions,
): Effect.Effect<void, never, R | Renderer | Observability> =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.void;
      }

      return Effect.gen(function* () {
        const observability = yield* Observability;
        const summary = summarize(cause);

        if (summary.tagged !== undefined) {
          yield* deliver(summary.tagged, options.sender);
        }

        yield* observability.log("error", logLine("Command", options.command, summary), cause);
      });
    }),
  );

/**
 * The shared event-failure policy. The only difference between the sync and
 * async surfaces is whether an untagged defect must fail loudly in
 * development; everything else renders and logs the same way (ADR-0005).
 */
const eventFailure = (
  cause: Cause.Cause<unknown>,
  options: EventBoundaryOptions,
  rethrowInDevelopment: boolean,
): Effect.Effect<SyncEventOutcome, never, Renderer | Observability> =>
  Effect.gen(function* () {
    if (Cause.hasInterruptsOnly(cause)) {
      return "handled";
    }

    const observability = yield* Observability;
    const summary = summarize(cause);
    const rethrow = rethrowInDevelopment && summary.hasUntagged && options.development === true;

    if (summary.tagged !== undefined) {
      yield* deliver(summary.tagged, options.sender);
    }
    if (summary.hasUntagged && !rethrow) {
      yield* deliver(summary.untagged, options.sender);
    }

    yield* observability.log(
      "error",
      logLine("Event handler", options.handler ?? options.event, summary),
      cause,
    );

    return rethrow ? "rethrow" : "handled";
  });

/**
 * The sync-event boundary. Tagged failures render and log. An untagged defect
 * renders and logs in production, but asks the dispatcher to rethrow it in
 * development, where a protection check that failed open must not be silent
 * (ADR-0005).
 */
export const syncEvent = (
  cause: Cause.Cause<unknown>,
  options: EventBoundaryOptions,
): Effect.Effect<SyncEventOutcome, never, Renderer | Observability> =>
  eventFailure(cause, options, true);

/**
 * The async-event boundary. Everything renders and logs; the async path has no
 * cancel window to protect, so there is no development-only loud branch.
 */
export const asyncEvent = (
  cause: Cause.Cause<unknown>,
  options: EventBoundaryOptions,
): Effect.Effect<void, never, Renderer | Observability> =>
  eventFailure(cause, options, false).pipe(Effect.asVoid);

/**
 * The error boundaries the host and the event dispatcher share. The policy
 * differs per surface, so each verb is separate rather than one configurable
 * handler (ADR-0005).
 */
export const Boundary = {
  command,
  syncEvent,
  asyncEvent,
};
