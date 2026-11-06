import { Clock, Duration, Effect, Option } from "effect";

/** How long one server tick lasts, in milliseconds. Paper runs at 20 TPS. */
export const TICK_MILLIS = 50;

const NANOS_PER_MILLI = 1_000_000n;
const NANOS_PER_TICK = BigInt(TICK_MILLIS) * NANOS_PER_MILLI;

interface Sleeper {
  readonly deadlineNanos: bigint;
  readonly wake: () => void;
}

/**
 * Server time for plugin programs. The clock is anchored to the server's boot
 * time and then moves only when the host calls {@link TickClock.advance}; it
 * never follows the system clock after that and never installs a timer. A
 * stopped or paused server simply stops calling `advance`, so plugin time stops
 * with it.
 *
 * The runtime provides {@link TickClock.clock} to a plugin program, which makes
 * `Effect.sleep`, schedules, and every other Effect time operation tick-driven.
 * Hosts pump {@link TickClock.advance} from the server tick; tests call it
 * directly.
 */
export class TickClock {
  private readonly originMillis = Date.now();
  private readonly sleepers = new Set<Sleeper>();
  private currentTicks = 0;

  /** The Effect `Clock` that reads this tick clock. */
  readonly clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => this.currentTimeMillis,
    currentTimeMillis: Effect.sync(() => this.currentTimeMillis),
    currentTimeNanosUnsafe: () => this.currentTimeNanos,
    currentTimeNanos: Effect.sync(() => this.currentTimeNanos),
    monotonicTimeNanosUnsafe: () => this.monotonicTimeNanos,
    monotonicTimeNanos: Effect.sync(() => this.monotonicTimeNanos),
    sleep: (duration) => this.sleep(duration),
  };

  /** Current Unix time in milliseconds, frozen between server ticks. */
  get currentTimeMillis(): number {
    return this.originMillis + this.currentTicks * TICK_MILLIS;
  }

  /** Current Unix time in nanoseconds, frozen between server ticks. */
  get currentTimeNanos(): bigint {
    return BigInt(this.currentTimeMillis) * NANOS_PER_MILLI;
  }

  /** Time elapsed since this clock was created, in nanoseconds. */
  get monotonicTimeNanos(): bigint {
    return BigInt(this.currentTicks) * NANOS_PER_TICK;
  }

  /**
   * Advances server time by `ticks` and wakes every sleeper whose deadline has
   * passed. Nothing else moves the clock.
   */
  advance(ticks = 1): void {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new RangeError("Tick advance must be a non-negative integer");
    }
    if (ticks === 0) {
      return;
    }

    this.currentTicks += ticks;
    this.wakeDueSleepers();
  }

  private wakeDueSleepers(): void {
    const now = this.monotonicTimeNanos;
    for (const sleeper of this.sleepers) {
      if (sleeper.deadlineNanos <= now) {
        this.sleepers.delete(sleeper);
        sleeper.wake();
      }
    }
  }

  private sleep(duration: Duration.Duration): Effect.Effect<void> {
    const nanos = Duration.toNanos(duration);
    if (Option.isNone(nanos)) {
      return Effect.never;
    }
    if (nanos.value <= 0n) {
      return Effect.void;
    }

    const deadlineNanos = this.monotonicTimeNanos + nanos.value;
    return Effect.callback<void>((resume) => {
      const sleeper: Sleeper = {
        deadlineNanos,
        wake: () => resume(Effect.void),
      };
      this.sleepers.add(sleeper);
      return Effect.sync(() => {
        this.sleepers.delete(sleeper);
      });
    });
  }
}
