import type {
  ItemStack,
  PersistentDataContainer,
  PersistentDataHolder,
} from "@effectmc/paper-types";
import { Effect, Layer, Option, Schema } from "effect";
import { expect, test } from "vite-plus/test";
import {
  Items,
  Pdc,
  PdcHandleClosed,
  Paper,
  Plugin,
  type PdcHandle,
  type RegionTarget,
} from "@effectmc/core";
import { TestHarness } from "./harness";
import type { FakePdc } from "./fake-pdc";

const Home = Schema.Struct({
  world: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
});

const Keys = Pdc.namespace("homes", {
  home: Home,
  owner: Schema.String,
});

const target = {} as RegionTarget;

test("a plugin program reads and writes typed persistent data through the harness", async () => {
  let holder: PersistentDataHolder | undefined;
  let observed: Option.Option<string> | undefined;

  const harness = TestHarness.make(
    Plugin(
      "pdc",
      Layer.empty,
      Effect.gen(function* () {
        yield* Paper.on(target, Pdc.set(holder!, Keys.owner, "alex"));
        observed = yield* Paper.on(target, Pdc.get(holder!, Keys.owner));
      }),
    ),
  );

  holder = {
    getPersistentDataContainer: () => harness.pdc as unknown as PersistentDataContainer,
  };

  await harness.start();

  expect(observed).toEqual(Option.some("alex"));
  expect(harness.pdc.get({ namespace: "homes", key: "owner" })).toBe("alex");

  await harness.teardown();
});

test("the harness stores a struct as nested containers", async () => {
  let holder: PersistentDataHolder | undefined;
  const home = { world: "world", x: 1, y: 2 };

  const harness = TestHarness.make(
    Plugin(
      "pdc-struct",
      Layer.empty,
      Effect.gen(function* () {
        yield* Paper.on(target, Pdc.set(holder!, Keys.home, home));
      }),
    ),
  );

  holder = {
    getPersistentDataContainer: () => harness.pdc as unknown as PersistentDataContainer,
  };

  await harness.start();

  const nested = harness.pdc.get({
    namespace: "homes",
    key: "home",
  }) as FakePdc;

  expect(nested).toBeDefined();
  expect(nested.get({ namespace: "homes", key: "x" })).toBe(1);

  await harness.teardown();
});

test("Items.editPdc scopes the handle and closes it after the callback", async () => {
  let container: PersistentDataContainer | undefined;
  let captured: PdcHandle | undefined;
  let observed: Option.Option<string> | undefined;

  const stack = {
    editPersistentDataContainer: (edit: (pdc: PersistentDataContainer) => void) => {
      if (container === undefined) {
        return false;
      }
      edit(container);
      return true;
    },
  } as unknown as ItemStack;

  const harness = TestHarness.make(
    Plugin(
      "item-pdc",
      Layer.empty,
      Effect.gen(function* () {
        observed = yield* Paper.on(
          target,
          Items.editPdc(stack, (pdc) => {
            captured = pdc;
            pdc.set(Keys.owner, "alex");
            return pdc.get(Keys.owner);
          }),
        );
      }),
    ),
  );

  container = harness.pdc as unknown as PersistentDataContainer;

  await harness.start();

  expect(observed).toEqual(Option.some("alex"));
  expect(harness.pdc.get({ namespace: "homes", key: "owner" })).toBe("alex");
  expect(() => captured!.set(Keys.owner, "bob")).toThrow(PdcHandleClosed);

  await harness.teardown();
});
