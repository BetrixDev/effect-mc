import type {
  ItemStack,
  NamespacedKey,
  PersistentDataContainer,
  PersistentDataHolder,
  PersistentDataType,
} from "@effectmc/paper-types";
import { Effect, Exit, Option, Schema } from "effect";
import { expect, test } from "vite-plus/test";
import { PdcDecodeError, PdcHandleClosed } from "./errors";
import { Items } from "./items";
import {
  makePdcHandle,
  Pdc,
  PdcPlatform,
  type PdcPlatformService,
  type PdcStorageKind,
} from "./pdc";
import { Main } from "./threads";

interface FakeKey {
  readonly namespace: string;
  readonly key: string;
}

const keyId = ({ namespace, key }: FakeKey): string => `${namespace}\u0000${key}`;

interface FakeContainer {
  readonly writes: Array<FakeKey>;
  get(key: FakeKey, type?: unknown): unknown;
  set(key: FakeKey, typeOrValue?: unknown, value?: unknown): void;
  has(key: FakeKey, type?: unknown): boolean;
  remove(key: FakeKey): void;
  getAdapterContext(): { newPersistentDataContainer(): FakeContainer };
}

const makeFakeContainer = (): FakeContainer => {
  const values = new Map<string, unknown>();
  const writes: Array<FakeKey> = [];

  const container: FakeContainer = {
    writes,
    get: (key) => values.get(keyId(key)),
    set: (key, typeOrValue, third) => {
      writes.push({ namespace: key.namespace, key: key.key });
      // Paper's signature is (key, type, value); the two-argument form is a
      // convenience for direct test setup.
      values.set(keyId(key), third === undefined ? typeOrValue : third);
    },
    has: (key) => values.has(keyId(key)),
    remove: (key) => {
      values.delete(keyId(key));
    },
    getAdapterContext: () => ({
      newPersistentDataContainer: () => makeFakeContainer(),
    }),
  };

  return container;
};

const fakePlatform: PdcPlatformService = {
  namespacedKey: (namespace, key) => ({ namespace, key }) as unknown as NamespacedKey,
  dataType: (kind: PdcStorageKind) => ({ kind }) as unknown as PersistentDataType<unknown, unknown>,
};

const key = (namespace: string, name: string): FakeKey => ({ namespace, key: name });

const Home = Schema.Struct({
  world: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
});

const Keys = Pdc.namespace("homes", {
  home: Home,
  owner: Schema.String,
  count: Schema.Number,
  marked: Schema.Boolean,
});

const makeHolder = (container: FakeContainer): PersistentDataHolder =>
  ({
    getPersistentDataContainer: () => container,
  }) as unknown as PersistentDataHolder;

const runInMain = <A, E>(effect: Effect.Effect<A, E, Main>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(Main, { region: undefined }),
      Effect.provideService(PdcPlatform, fakePlatform),
    ),
  );

const readError = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  return Option.getOrThrow(Exit.findErrorOption(exit));
};

test("a namespace declares typed keys once", () => {
  expect(Keys.owner.namespace).toBe("homes");
  expect(Keys.owner.key).toBe("owner");
  expect(() => Pdc.namespace("", { owner: Schema.String })).toThrow(TypeError);
});

test("primitives round-trip and a missing key is Option.none", async () => {
  const container = makeFakeContainer();
  const holder = makeHolder(container);

  expect(await runInMain(Pdc.get(holder, Keys.owner))).toEqual(Option.none());
  expect(await runInMain(Pdc.has(holder, Keys.owner))).toBe(false);

  await runInMain(Pdc.set(holder, Keys.owner, "alex"));

  expect(await runInMain(Pdc.get(holder, Keys.owner))).toEqual(Option.some("alex"));
  expect(await runInMain(Pdc.has(holder, Keys.owner))).toBe(true);

  await runInMain(Pdc.remove(holder, Keys.owner));

  expect(await runInMain(Pdc.get(holder, Keys.owner))).toEqual(Option.none());
});

test("a value that fails to decode is PdcDecodeError", async () => {
  const container = makeFakeContainer();
  const holder = makeHolder(container);

  // Bypass the typed write path: the stored value is the wrong shape for the
  // key's Schema, which is exactly how another plugin's corruption appears.
  container.set(key("homes", "owner"), { kind: "string" }, 42);

  const exit = await Effect.runPromiseExit(
    Pdc.get(holder, Keys.owner).pipe(
      Effect.provideService(Main, { region: undefined }),
      Effect.provideService(PdcPlatform, fakePlatform),
    ),
  );
  const error = readError(exit);

  expect(error).toBeInstanceOf(PdcDecodeError);
  expect((error as PdcDecodeError).key).toBe("homes:owner");
  expect((error as PdcDecodeError).detail.length).toBeGreaterThan(0);
});

test("a struct round-trips as a nested container", async () => {
  const container = makeFakeContainer();
  const holder = makeHolder(container);
  const home = { world: "world", x: 1, y: 2 };

  await runInMain(Pdc.set(holder, Keys.home, home));

  expect(container.get(key("homes", "home"))).toBeDefined();
  expect(await runInMain(Pdc.get(holder, Keys.home))).toEqual(Option.some(home));
});

test("updating one struct field does not rewrite the other fields", async () => {
  const container = makeFakeContainer();
  const holder = makeHolder(container);
  const home = { world: "world", x: 1, y: 2 };

  await runInMain(Pdc.set(holder, Keys.home, home));
  const nested = container.get(key("homes", "home")) as FakeContainer;

  nested.writes.length = 0;
  container.writes.length = 0;

  await runInMain(Pdc.set(holder, Keys.home, { ...home, x: 9 }));

  expect(nested.writes).toEqual([key("homes", "x")]);
  expect(nested.get(key("homes", "world"))).toBe("world");
  expect(nested.get(key("homes", "x"))).toBe(9);
  expect(nested.get(key("homes", "y"))).toBe(2);
});

test("writing an unchanged struct writes nothing", async () => {
  const container = makeFakeContainer();
  const holder = makeHolder(container);
  const home = { world: "world", x: 1, y: 2 };

  await runInMain(Pdc.set(holder, Keys.home, home));
  container.writes.length = 0;

  await runInMain(Pdc.set(holder, Keys.home, home));

  expect(container.writes).toEqual([]);
});

test("a corrupted nested container is PdcDecodeError", async () => {
  const container = makeFakeContainer();
  const holder = makeHolder(container);

  container.set(key("homes", "home"), { kind: "container" }, "not a container");

  const exit = await Effect.runPromiseExit(
    Pdc.get(holder, Keys.home).pipe(
      Effect.provideService(Main, { region: undefined }),
      Effect.provideService(PdcPlatform, fakePlatform),
    ),
  );
  const error = readError(exit);

  expect(error).toBeInstanceOf(PdcDecodeError);
  expect((error as PdcDecodeError).key).toBe("homes:home");
});

test("a scoped item handle works inside the callback and is closed afterwards", async () => {
  const container = makeFakeContainer();
  const { handle, close } = makePdcHandle(
    container as unknown as PersistentDataContainer,
    fakePlatform,
  );

  handle.set(Keys.owner, "alex");
  expect(handle.get(Keys.owner)).toEqual(Option.some("alex"));
  expect(handle.has(Keys.owner)).toBe(true);

  close();

  expect(() => handle.get(Keys.owner)).toThrow(PdcHandleClosed);
  expect(() => handle.set(Keys.owner, "bob")).toThrow(PdcHandleClosed);
  expect(() => handle.has(Keys.owner)).toThrow(PdcHandleClosed);
  expect(() => handle.remove(Keys.owner)).toThrow(PdcHandleClosed);
});

test("Items.editPdc closes the handle after the consumer returns", async () => {
  const container = makeFakeContainer();
  let captured: ReturnType<typeof makePdcHandle>["handle"] | undefined;

  const stack = {
    editPersistentDataContainer: (edit: (pdc: PersistentDataContainer) => void) => {
      edit(container as unknown as PersistentDataContainer);
      return true;
    },
  } as unknown as ItemStack;

  const result = await runInMain(
    Items.editPdc(stack, (pdc) => {
      captured = pdc;
      pdc.set(Keys.owner, "alex");
      return pdc.get(Keys.owner);
    }),
  );

  expect(result).toEqual(Option.some("alex"));
  expect(() => captured!.set(Keys.owner, "bob")).toThrow(PdcHandleClosed);
});
