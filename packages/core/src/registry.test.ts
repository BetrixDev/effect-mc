import { expect, test } from "vite-plus/test";
import { makeRegistry } from "./registry";

test("records, removes, and empties registrations", () => {
  const registry = makeRegistry();
  const event = registry.add({ kind: "event", name: "BlockBreakEvent" });
  const task = registry.add({ kind: "task", name: "sweep" });

  expect(registry.entries()).toEqual([
    { kind: "event", name: "BlockBreakEvent" },
    { kind: "task", name: "sweep" },
  ]);

  registry.remove(event);
  expect(registry.entries()).toEqual([task]);

  registry.clear();
  expect(registry.entries()).toEqual([]);
});

test("returns a snapshot rather than the live record", () => {
  const registry = makeRegistry();
  registry.add({ kind: "command", name: "warp" });

  const entries = registry.entries();
  (entries as Array<unknown>).length = 0;

  expect(registry.entries()).toEqual([{ kind: "command", name: "warp" }]);
});
