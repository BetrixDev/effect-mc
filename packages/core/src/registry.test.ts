import { expect, test } from "vite-plus/test";
import { makeRegistry } from "./registry";

test("records, removes, and empties registrations", () => {
  const registry = makeRegistry();
  const listener = { kind: "listener", name: "BlockBreakEvent" } as const;
  const task = { kind: "task", name: "sweep" } as const;
  registry.add(listener);
  registry.add(task);

  expect(registry.entries()).toEqual([listener, task]);

  registry.remove(listener);
  expect(registry.entries()).toEqual([task]);

  registry.clear();
  expect(registry.entries()).toEqual([]);
});

test("returns a snapshot rather than the live record", () => {
  const registry = makeRegistry();
  registry.add({ kind: "task", name: "warp" });

  const entries = registry.entries();
  (entries as Array<unknown>).length = 0;

  expect(registry.entries()).toEqual([{ kind: "task", name: "warp" }]);
});
