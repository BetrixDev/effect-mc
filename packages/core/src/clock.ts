import { Clock, Duration, Effect, Option } from "effect";

/** How long one server tick lasts, in milliseconds. Paper runs at 20 TPS. */
export const TICK_MILLIS = 50;

/** How many server ticks make up one second. */
export const TICKS_PER_SECOND = 1000 / TICK_MILLIS;

export interface TickClockOptions {
  /** Length of one tick in milliseconds. Defaults to {@link TICK_MILLIS}. */
  readonly millisPerTick?: number;
}

interface Sleeper {
  readonly deadlineNanos: bigint;
  readonly wake: () => void;
}

/**
 * Server time for plugin programs. The clock starts at tick zero and moves
 * only when the host calls {@link TickClock.advance}; it never reads wall time
 * and never installs a timer. A stopped or paused server simply stops calling
 * `advance`, so plugin time stops with it.
 *
 * The runtime provides {@link TickClock.clock} to a plugin program, which makes
 * `Effect.sleep`, schedules, and every other Effect time operation tick-driven.
 * Hosts pump {@link TickClock.advance} from the server tick; tests call it
 * directly.
 */
export class TickClock {
  private readonly nanosPerTick: bigint;
  private readonly sleepers = new Set<Sleeper>();
  private currentTicks = 0;

  /** The Effect `Clock` that reads this tick clock. */
  readonly clock: Clock.Clock;

  constructor(options: TickClockOptions = {}) {
    const millisPerTick = options.millisPerTick ?? TICK_MILLIS;
    if (!Number.isFinite(millisPerTick) || millisPerTick <= 0) {
      throw new RangeError("Tick length must be a finite, positive number of milliseconds");
    }

    this.nanosPerTick = BigInt(Math.round(millisPerTick * 1_000_000));
    this.clock = {
      currentTimeMillisUnsafe: () => this.currentTimeMillis,
      currentTimeMillis: Effect.sync(() => this.currentTimeMillis),
      currentTimeNanosUnsafe: () => this.currentTimeNanos,
      currentTimeNanos: Effect.sync(() => this.currentTimeNanos),
      monotonicTimeNanosUnsafe: () => this.currentTimeNanos,
      monotonicTimeNanos: Effect.sync(() => this.currentTimeNanos),
      sleep: (duration) => this.sleep(duration),
    };
  }

  /** Ticks elapsed since the clock was created. */
  get ticks(): number {
    return this.currentTicks;
  }

  /** Current plugin wall time in milliseconds, measured from tick zero. */
  get currentTimeMillis(): number {
    return Number(this.currentTimeNanos) / 1_000_000;
  }

  /** Current plugin time in nanoseconds, measured from tick zero. */
  get currentTimeNanos(): bigint {
    return BigInt(this.currentTicks) * this.nanosPerTick;
  }

  /**
   * Advances server time by `ticks` and wakes every sleeper whose deadline has
   * passed. Nothing else moves the clock.
   */
  advance(ticks = 1): void {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new RangeError("Tick advance must be a non-negative integer");
    }

    for (let elapsed = 0; elapsed < ticks; elapsed++) {
      this.currentTicks += 1;
      this.wakeDueSleepers();
    }
  }

  private wakeDueSleepers(): void {
    const now = this.currentTimeNanos;
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

    const deadlineNanos = this.currentTimeNanos + nanos.value;
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
