import { Effect } from "effect";
import { expect, test } from "vite-plus/test";
import { Paper } from "./paper";
import { Main, MainThread, type MainThreadService, type RegionTarget, Worker } from "./threads";

const trackingMainThread = (): {
  readonly service: MainThreadService;
  readonly hops: Array<RegionTarget>;
} => {
  const hops: Array<RegionTarget> = [];
  return {
    hops,
    service: {
      run: (target, effect) =>
        Effect.sync(() => {
          hops.push(target);
        }).pipe(Effect.flatMap(() => effect)),
    },
  };
};

test("a hop is a no-op when already on Main for the same region", async () => {
  const target = { name: "alex" } as unknown as RegionTarget;
  const mainThread = trackingMainThread();
  let region: RegionTarget | undefined;

  await Effect.runPromise(
    Paper.on(
      target,
      Effect.gen(function* () {
        region = (yield* Main).region;
      }),
    ).pipe(
      Effect.provideService(Main, { region: target }),
      Effect.provideService(MainThread, mainThread.service),
    ),
  );

  expect(mainThread.hops).toEqual([]);
  expect(region).toBe(target);
});

test("a hop is a no-op when Main came from the single Paper region", async () => {
  const target = { name: "alex" } as unknown as RegionTarget;
  const mainThread = trackingMainThread();

  await Effect.runPromise(
    Paper.on(target, Effect.void).pipe(
      Effect.provideService(Main, { region: undefined }),
      Effect.provideService(MainThread, mainThread.service),
    ),
  );

  expect(mainThread.hops).toEqual([]);
});

test("a hop enters Main when the current region differs", async () => {
  const current = { name: "alex" } as unknown as RegionTarget;
  const target = { name: "steve" } as unknown as RegionTarget;
  const mainThread = trackingMainThread();
  let region: RegionTarget | undefined;

  await Effect.runPromise(
    Paper.on(
      target,
      Effect.gen(function* () {
        region = (yield* Main).region;
      }),
    ).pipe(
      Effect.provideService(Main, { region: current }),
      Effect.provideService(MainThread, mainThread.service),
    ),
  );

  expect(mainThread.hops).toEqual([target]);
  expect(region).toBe(target);
});

test("a hop treats equal locations as the same region", async () => {
  const world = {};
  const location = (x: number) =>
    ({
      getWorld: () => world,
      getX: () => x,
      getY: () => 64,
      getZ: () => 0,
    }) as unknown as RegionTarget;
  const mainThread = trackingMainThread();

  await Effect.runPromise(
    Paper.on(location(0), Effect.void).pipe(
      Effect.provideService(Main, { region: location(0) }),
      Effect.provideService(MainThread, mainThread.service),
    ),
  );

  expect(mainThread.hops).toEqual([]);
});

test("offload runs the thunk on the worker and needs no Main", async () => {
  let calls = 0;
  const worker = {
    run: <A>(thunk: () => A) => {
      calls += 1;
      return Effect.sync(thunk);
    },
  };

  const result = await Effect.runPromise(
    Paper.offload(() => 41 + 1).pipe(Effect.provideService(Worker, worker)),
  );

  expect(result).toBe(42);
  expect(calls).toBe(1);
});
