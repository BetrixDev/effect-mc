import { Clock, Duration, Effect, Exit, Fiber, Option } from "effect";
import { expect, test } from "vite-plus/test";
import { TICK_MILLIS, TickClock } from "./clock";

const flush = (): Promise<void> => Effect.runPromise(Effect.yieldNow);

const withClock = <A, E, R>(clock: TickClock, effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, Clock.Clock, clock.clock);

const startSleep = (clock: TickClock, ticks: number) =>
  Effect.runFork(withClock(clock, Effect.sleep(Duration.millis(TICK_MILLIS * ticks))));

const readMillis = (clock: TickClock): Promise<number> =>
  Effect.runPromise(withClock(clock, Clock.currentTimeMillis));

test("a sleep of N ticks resolves only after N ticks", async () => {
  const clock = new TickClock();
  const fiber = startSleep(clock, 2);

  expect(fiber.pollUnsafe()).toBeUndefined();

  clock.advance();
  await flush();
  expect(fiber.pollUnsafe()).toBeUndefined();

  clock.advance();
  await flush();
  const exit = fiber.pollUnsafe();
  expect(exit).toBeDefined();
  expect(Exit.isSuccess(exit!)).toBe(true);
});

test("time does not advance without a tick", async () => {
  const clock = new TickClock();
  const start = await readMillis(clock);

  expect(await readMillis(clock)).toBe(start);

  clock.advance(3);

  expect(await readMillis(clock)).toBe(start + TICK_MILLIS * 3);
});

test("advancing by several ticks resolves a sleep once its deadline passes", async () => {
  const clock = new TickClock();
  const fiber = startSleep(clock, 3);

  clock.advance(2);
  await flush();
  expect(fiber.pollUnsafe()).toBeUndefined();

  clock.advance();
  await flush();
  expect(Exit.isSuccess(fiber.pollUnsafe()!)).toBe(true);
});

test("sleepers with different deadlines wake on their own ticks", async () => {
  const clock = new TickClock();
  const short = startSleep(clock, 1);
  const long = startSleep(clock, 3);

  clock.advance();
  await flush();
  expect(Exit.isSuccess(short.pollUnsafe()!)).toBe(true);
  expect(long.pollUnsafe()).toBeUndefined();

  clock.advance(2);
  await flush();
  expect(Exit.isSuccess(long.pollUnsafe()!)).toBe(true);
});

test("a timeout runs on the tick clock", async () => {
  const clock = new TickClock();
  const fiber = Effect.runFork(
    withClock(clock, Effect.never.pipe(Effect.timeoutOption(Duration.millis(TICK_MILLIS * 2)))),
  );

  clock.advance();
  await flush();
  expect(fiber.pollUnsafe()).toBeUndefined();

  clock.advance();
  await flush();
  const exit = fiber.pollUnsafe();
  expect(Exit.isSuccess(exit!)).toBe(true);
  if (Exit.isSuccess(exit!)) {
    expect(Option.isNone(exit.value)).toBe(true);
  }
});

test("a zero sleep resolves immediately and an infinite sleep never does", async () => {
  const clock = new TickClock();

  const zero = Effect.runFork(withClock(clock, Effect.sleep(Duration.zero)));
  await flush();
  expect(Exit.isSuccess(zero.pollUnsafe()!)).toBe(true);

  const infinite = Effect.runFork(withClock(clock, Effect.sleep(Duration.infinity)));
  clock.advance(100);
  await flush();
  expect(infinite.pollUnsafe()).toBeUndefined();
});

test("an interrupted sleeper is not woken by a later tick", async () => {
  const clock = new TickClock();
  const fiber = startSleep(clock, 2);

  await Effect.runPromise(Fiber.interrupt(fiber));

  clock.advance(5);
  await flush();

  const exit = fiber.pollUnsafe();
  expect(exit).toBeDefined();
  expect(Exit.hasInterrupts(exit!)).toBe(true);
});
