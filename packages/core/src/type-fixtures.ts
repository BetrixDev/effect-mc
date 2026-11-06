/**
 * Compile-time fixtures for the Plugin contract. This file is checked by
 * `tsc --noEmit`; the `@ts-expect-error` disappears if a constraint is lost.
 */
import { Context, Effect, Layer } from "effect";
import { Plugin } from "./plugin";
import { Registry } from "./registry";

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
