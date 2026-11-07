import { Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import { Paper, Plugin, type RegionTarget, Sender } from "@effectmc/core";
import { TestHarness } from "./harness";

test("the harness wires the Sender facade to its fake sender", async () => {
  const harness = TestHarness.make(
    Plugin(
      "sender",
      Layer.empty,
      Paper.on({} as RegionTarget, Sender.send("hello from the harness")),
    ),
  );

  await harness.start();

  expect(harness.sender.messages()).toEqual(["hello from the harness"]);

  await harness.teardown();
});

test("the harness runs offloaded work through the supplied worker", async () => {
  let calls = 0;
  const harness = TestHarness.make(
    Plugin(
      "offload",
      Layer.empty,
      Effect.gen(function* () {
        const value = yield* Paper.offload(() => {
          calls += 1;
          return 7;
        });
        expect(value).toBe(7);
      }),
    ),
    {
      worker: {
        run: (thunk) => {
          return Effect.sync(thunk);
        },
      },
    },
  );

  await harness.start();

  expect(calls).toBe(1);

  await harness.teardown();
});
