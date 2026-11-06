import { Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import { Events, Plugin, Registry } from "@effectmc/core";
import { ProgramDidNotComplete, LeakedRegistrations } from "./errors";
import { TestHarness } from "./harness";

class PingEvent {
  constructor(readonly id: string) {}
}

const catchError = async (promise: Promise<void>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (cause: unknown) => cause,
  );

test("exposes the fakes a test asserts against", () => {
  const harness = TestHarness.make(Plugin("demo", Layer.empty, Effect.void));

  expect(harness.scheduler.clock).toBe(harness.clock);
  expect(harness.events.listeners()).toEqual([]);
  expect(harness.registry.entries()).toEqual([]);

  harness.sender.send("hello");
  harness.pdc.set({ namespace: "demo", key: "home" }, "here");

  expect(harness.sender.messages()).toEqual(["hello"]);
  expect(harness.pdc.get({ namespace: "demo", key: "home" })).toBe("here");
});

test("runs a program to completion and exposes the Registry", async () => {
  const harness = TestHarness.make(
    Plugin(
      "demo",
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(PingEvent, { mode: "sync" }, () => Effect.void);
      }),
    ),
  );

  await harness.start();

  expect(harness.runtime.status).toBe("running");
  expect(harness.registry.entries()).toEqual([{ kind: "listener", name: "PingEvent:sync:normal" }]);

  await harness.teardown();

  expect(harness.runtime.status).toBe("disposed");
  expect(harness.registry.entries()).toEqual([]);
  expect(harness.events.listeners()).toEqual([]);
});

test("fails with a clear error when the program does not complete", async () => {
  const harness = TestHarness.make(Plugin("stuck", Layer.empty, Effect.never), {
    programTimeout: "50 millis",
  });

  const error = await catchError(harness.start());

  expect(error).toBeInstanceOf(ProgramDidNotComplete);
  expect(error).toMatchObject({
    _tag: "ProgramDidNotComplete",
    plugin: "stuck",
    timeoutMillis: 50,
  });
  expect((error as ProgramDidNotComplete).message).toContain("stuck");
  expect((error as ProgramDidNotComplete).message).toContain("did not complete");

  expect(harness.runtime.status).toBe("disposed");
  await harness.teardown();
});

test("a deliberately leaking plugin fails the teardown assertion", async () => {
  const harness = TestHarness.make(
    Plugin(
      "leaky",
      Layer.empty,
      Effect.gen(function* () {
        const registry = yield* Registry;
        registry.add({ kind: "task", name: "leak" });
      }),
    ),
  );

  await harness.start();
  expect(harness.registry.entries()).toEqual([{ kind: "task", name: "leak" }]);

  const error = await catchError(harness.teardown());

  expect(error).toBeInstanceOf(LeakedRegistrations);
  expect(error).toMatchObject({
    _tag: "LeakedRegistrations",
    plugin: "leaky",
    registrations: [{ kind: "task", name: "leak" }],
  });
  expect((error as LeakedRegistrations).message).toContain("task:leak");

  // The runtime's teardown still clears the Registry; the harness records the
  // entries that were there when it did.
  expect(harness.registry.entries()).toEqual([]);
});

test("surfaces a failing program instead of reporting a healthy runtime", async () => {
  const harness = TestHarness.make(Plugin("bad", Layer.empty, Effect.fail(new Error("boom"))));

  await expect(harness.start()).rejects.toThrow("boom");

  expect(harness.runtime.status).toBe("failed");

  await harness.teardown();
});

test("advances the runtime clock from the fake scheduler", async () => {
  const harness = TestHarness.make(
    Plugin(
      "clocked",
      Layer.empty,
      Effect.gen(function* () {
        yield* Effect.sleep("100 millis");
        yield* Events.attach(PingEvent, { mode: "sync" }, () => Effect.void);
      }),
    ),
  );

  const starting = harness.start();
  await harness.scheduler.flush();
  expect(harness.registry.entries()).toEqual([]);

  await harness.advance(2);
  await starting;

  expect(harness.registry.entries()).toEqual([{ kind: "listener", name: "PingEvent:sync:normal" }]);

  await harness.teardown();
});
