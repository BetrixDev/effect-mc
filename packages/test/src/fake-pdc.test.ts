import { expect, test } from "vite-plus/test";
import { makeFakePdc, type FakePdcKey } from "./fake-pdc";

const home: FakePdcKey = { namespace: "homes", key: "home" };
const owner: FakePdcKey = { namespace: "homes", key: "owner" };

test("stores and reads values by namespace and key", () => {
  const pdc = makeFakePdc();

  pdc.set(home, { x: 1, y: 2, z: 3 });

  expect(pdc.get({ ...home })).toEqual({ x: 1, y: 2, z: 3 });
  expect(pdc.has(home)).toBe(true);
  expect(pdc.keys()).toEqual([home]);
});

test("distinguishes keys that share a simple name", () => {
  const pdc = makeFakePdc();

  pdc.set(home, "homes:home");
  pdc.set({ namespace: "warps", key: "home" }, "warps:home");

  expect(pdc.get(home)).toBe("homes:home");
  expect(pdc.get({ namespace: "warps", key: "home" })).toBe("warps:home");
});

test("removes and clears stored values", () => {
  const pdc = makeFakePdc();
  pdc.set(home, "here");
  pdc.set(owner, "alex");

  pdc.remove(home);

  expect(pdc.has(home)).toBe(false);
  expect(pdc.get(home)).toBeUndefined();
  expect(pdc.keys()).toEqual([owner]);

  pdc.clear();

  expect(pdc.keys()).toEqual([]);
  expect(pdc.has(owner)).toBe(false);
});

test("returns key copies so callers cannot mutate stored keys", () => {
  const pdc = makeFakePdc();
  pdc.set(home, "here");

  const [stored] = pdc.keys();
  (stored as { namespace: string }).namespace = "changed";

  expect(pdc.keys()).toEqual([home]);
  expect(pdc.get(home)).toBe("here");
});
