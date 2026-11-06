import { Effect, Layer, Scope } from "effect";
import type { Observability } from "./observability";
import type { Registry } from "./registry";

/**
 * Services the runtime provides to every plugin program. A program may
 * require them without declaring them in its Layer, which is why attach verbs
 * can ask for `Scope` and `Registry` without making the author wire them.
 */
export type RuntimeServices = Registry | Observability | Scope.Scope;

/**
 * The declarative value a plugin module default-exports (ADR-0001).
 *
 * `R` is the set of services the plugin's Layer provides. The program can
 * require those plus {@link RuntimeServices}; requiring anything else is a
 * compile error, not a startup failure.
 */
export interface Plugin<R = never, E = never> {
  readonly name: string;
  readonly layer: Layer.Layer<R, E, never>;
  readonly program: Effect.Effect<void, E, R | RuntimeServices>;
}

/**
 * Declares a plugin: a name, one Layer, and a finite program.
 *
 * The program installs registrations and completes. A program that blocks is a
 * bug; development runtimes warn when that happens (ADR-0002).
 */
export function Plugin<R = never, LayerError = never, ProgramError = never>(
  name: string,
  layer: Layer.Layer<R, LayerError, never>,
  program: Effect.Effect<void, ProgramError, R | RuntimeServices>,
): Plugin<R, LayerError | ProgramError> {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("Plugin name must be a non-empty string");
  }

  return { name, layer, program };
}

/** Validates the shape the host reads from a module's default export. */
export function isPlugin(value: unknown): value is Plugin<never, never> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Plugin<never, never>>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    Layer.isLayer(candidate.layer) &&
    Effect.isEffect(candidate.program)
  );
}
