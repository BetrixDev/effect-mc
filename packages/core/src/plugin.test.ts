import { Context, Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import { isPlugin, Plugin } from "./plugin";
import { Registry } from "./registry";

class Missing extends Context.Service<Missing, void>()("Missing") {}

class Provided extends Context.Service<Provided, { readonly value: number }>()("Provided") {}

test("carries the name, one layer, and a finite program", () => {
  const layer = Layer.succeed(Provided, { value: 1 });
  const program = Effect.gen(function* () {
    const provided = yield* Provided;
    expect(provided.value).toBe(1);
  });

  const plugin = Plugin("demo", layer, program);

  expect(plugin.name).toBe("demo");
  expect(plugin.layer).toBe(layer);
  expect(plugin.program).toBe(program);
});

test("accepts runtime services without asking the author for a layer", () => {
  const plugin = Plugin(
    "demo",
    Layer.empty,
    Effect.gen(function* () {
      const registry = yield* Registry;
      registry.add({ kind: "task", name: "sweep" });
    }),
  );

  expect(plugin.name).toBe("demo");
});

// This fixture is compiled but never executed: the assertion is the
// `@ts-expect-error`, which disappears if the constraint is lost.
const unsatisfiedRequirementFixture = () => {
  const program: Effect.Effect<void, never, Missing> = Effect.gen(function* () {
    yield* Missing;
  });

  // @ts-expect-error Missing is not provided by the layer.
  Plugin("demo", Layer.empty, program);
};

test("rejects a program whose requirements the layer does not satisfy", () => {
  expect(unsatisfiedRequirementFixture).toBeTypeOf("function");
});

test("rejects an empty name", () => {
  expect(() => Plugin("   ", Layer.empty, Effect.void)).toThrow(TypeError);
});

test("recognises a Plugin and rejects a loose module export", () => {
  const plugin = Plugin("demo", Layer.empty, Effect.void);

  expect(isPlugin(plugin)).toBe(true);
  expect(isPlugin({ name: "demo" })).toBe(false);
  expect(isPlugin({ name: "demo", layer: Layer.empty })).toBe(false);
  expect(isPlugin(null)).toBe(false);
});
