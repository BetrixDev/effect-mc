import { Schema } from "effect";

export const runtimeStates = ["idle", "starting", "running", "failed", "disposed"] as const;

export type RuntimeState = (typeof runtimeStates)[number];

/**
 * Raised when the runtime is asked to start in a state other than `idle`.
 * Disposal is terminal: the runtime never starts again, and a restart
 * constructs a new `PluginRuntime`.
 */
export class RuntimeStateError extends Schema.TaggedError<RuntimeStateError>()(
  "RuntimeStateError",
  {
    plugin: Schema.String,
    state: Schema.Literals(runtimeStates),
    message: Schema.String,
  },
) {}

/**
 * Raised by `EventHandle.cancel` when the synchronous dispatch window has
 * already closed. The type system cannot catch a cancel reached through a fork,
 * because a forked fiber inherits `SyncWindow`; this error is the runtime
 * backstop for that one hole (ADR-0010).
 */
export class AsyncInCancellableHandler extends Schema.TaggedError<AsyncInCancellableHandler>()(
  "AsyncInCancellableHandler",
  {
    event: Schema.String,
    message: Schema.String,
  },
) {}
