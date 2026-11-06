import { Clock, type Duration, Effect } from "effect";
import { expect, test } from "vite-plus/test";
import { FakeClock } from "./fake-clock";
import { FakeScheduler } from "./fake-scheduler";

const sleepFor = (clock: FakeClock, duration: Duration.Input, onWake: () => void): void => {
  Effect.runFork(
    Effect.provideService(
      Effect.gen(function* () {
        yield* Effect.sleep(duration);
        onWake();
      }),
      Clock.Clock,
      clock.clock,
    ),
  );
};

test("time does not advance until the fake clock is advanced", async () => {
  const clock = new FakeClock();
  let woke = false;
  sleepFor(clock, "100 millis", () => {
    woke = true;
  });

  await Effect.runPromise(Effect.yieldNow);
  expect(woke).toBe(false);

  clock.advance(1);
  await Effect.runPromise(Effect.yieldNow);
  expect(woke).toBe(false);

  clock.advance(1);
  await Effect.runPromise(Effect.yieldNow);
  expect(woke).toBe(true);
});

test("the fake scheduler advances time and lets woken fibers run", async () => {
  const scheduler = new FakeScheduler();
  let woke = false;
  sleepFor(scheduler.clock, "100 millis", () => {
    woke = true;
  });

  await scheduler.advance(1);
  expect(woke).toBe(false);

  await scheduler.advance(1);
  expect(woke).toBe(true);
});

test("the fake scheduler can flush without moving time", async () => {
  const scheduler = new FakeScheduler();
  const start = scheduler.clock.currentTimeMillis;

  await scheduler.flush();

  expect(scheduler.clock.currentTimeMillis).toBe(start);
});
