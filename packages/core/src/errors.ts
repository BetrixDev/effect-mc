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
