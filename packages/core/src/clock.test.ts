import { Clock, Duration, Effect, Exit, Fiber } from "effect";
import { expect, test } from "vite-plus/test";
import { TICK_MILLIS, TickClock } from "./clock";

const flush = (): Promise<void> => Effect.runPromise(Effect.yieldNow);

test("a sleep of N ticks resolves only after N ticks", async () => {
  const clock = new TickClock();
  const fiber = Effect.runFork(
    Effect.sleep(Duration.millis(TICK_MILLIS * 2)).pipe(
      Effect.provideService(Clock.Clock, clock.clock),
    ),
  );

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

  expect(await readMillis(clock)).toBe(0);
  expect(await readMillis(clock)).toBe(0);

  clock.advance(3);

  expect(await readMillis(clock)).toBe(TICK_MILLIS * 3);
});

test("advancing by several ticks resolves a sleep once its deadline passes", async () => {
  const clock = new TickClock();
  const fiber = Effect.runFork(
    Effect.sleep(Duration.millis(TICK_MILLIS * 3)).pipe(
      Effect.provideService(Clock.Clock, clock.clock),
    ),
  );

  clock.advance(2);
  await flush();
  expect(fiber.pollUnsafe()).toBeUndefined();

  clock.advance();
  await flush();
  expect(Exit.isSuccess(fiber.pollUnsafe()!)).toBe(true);
});

test("an interrupted sleeper is not woken by a later tick", async () => {
  const clock = new TickClock();
  const fiber = Effect.runFork(
    Effect.sleep(Duration.millis(TICK_MILLIS * 2)).pipe(
      Effect.provideService(Clock.Clock, clock.clock),
    ),
  );

  await Effect.runPromise(Fiber.interrupt(fiber));

  clock.advance(5);
  await flush();

  const exit = fiber.pollUnsafe();
  expect(exit).toBeDefined();
  expect(Exit.hasInterrupts(exit!)).toBe(true);
});

const readMillis = (clock: TickClock): Promise<number> =>
  Effect.runPromise(Effect.provideService(Clock.currentTimeMillis, Clock.Clock, clock.clock));
