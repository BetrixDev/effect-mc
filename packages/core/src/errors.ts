import { Schema } from "effect";

export type RuntimeState = "idle" | "starting" | "running" | "failed" | "disposed";

/**
 * Raised when the runtime is asked to start in a state other than `idle`, or
 * to dispose while it is still starting. A disposed runtime is terminal: a
 * restart means constructing a new `PluginRuntime` (ADR-0002, `ManagedRuntime`
 * disposal is terminal).
 */
export class RuntimeStateError extends Schema.TaggedError<RuntimeStateError>()(
  "RuntimeStateError",
  {
    plugin: Schema.String,
    state: Schema.Literals(["idle", "starting", "running", "failed", "disposed"]),
    message: Schema.String,
  },
) {}
