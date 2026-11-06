import { expect, test } from "vite-plus/test";
import { makeFakeRegistry } from "./fake-registry";

test("records and removes registrations", () => {
  const registry = makeFakeRegistry();
  const remove = registry.add({ kind: "task", name: "sweep" });

  expect(registry.entries()).toEqual([{ kind: "task", name: "sweep" }]);

  remove();

  expect(registry.entries()).toEqual([]);
});

test("records the entries that were present when teardown cleared it", () => {
  const registry = makeFakeRegistry();
  registry.add({ kind: "listener", name: "PingEvent:sync:normal" });
  registry.add({ kind: "task", name: "sweep" });

  registry.clear();

  expect(registry.entries()).toEqual([]);
  expect(registry.leaked()).toEqual([
    { kind: "listener", name: "PingEvent:sync:normal" },
    { kind: "task", name: "sweep" },
  ]);
});

test("reports no leak when every registration was removed first", () => {
  const registry = makeFakeRegistry();
  const remove = registry.add({ kind: "task", name: "sweep" });
  remove();

  registry.clear();

  expect(registry.leaked()).toEqual([]);
});
