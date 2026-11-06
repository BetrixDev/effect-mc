import { Context, Effect, Layer } from "effect";

export type ObservabilityLevel = "info" | "warning" | "error";

export interface ObservabilityService {
  readonly log: (
    level: ObservabilityLevel,
    message: string,
    cause?: unknown,
  ) => Effect.Effect<void>;
}

const defaultLog: ObservabilityService["log"] = (level, message, cause) =>
  Effect.sync(() => {
    const method = level === "error" ? "error" : level === "warning" ? "warn" : "info";
    const line = `[EffectMC] ${message}`;
    if (cause === undefined) {
      console[method](line);
    } else {
      console[method](line, cause);
    }
  });

/**
 * The runtime's observability seam. The default layer writes to `console`,
 * which the Paper host binds to the server log; tests and hosts can swap it
 * through `PluginRuntimeOptions.observability`.
 */
export class Observability extends Context.Service<Observability, ObservabilityService>()(
  "effectmc/Observability",
) {
  static readonly layer: Layer.Layer<Observability> = Layer.succeed(Observability, {
    log: defaultLog,
  });
}
