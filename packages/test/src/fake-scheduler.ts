import { TickClock } from "@effectmc/core";
import { Effect } from "effect";

/**
 * The test stand-in for the host's tick pump. `advance` moves the clock and
 * gives the Effect runtime a turn so woken fibers can run before the test
 * asserts.
 */
export class FakeScheduler {
  constructor(readonly clock: TickClock = new TickClock()) {}

  /** Advances server time by `ticks` and lets woken fibers make progress. */
  async advance(ticks = 1): Promise<void> {
    this.clock.advance(ticks);
    await this.flush();
  }

  /** Gives the Effect runtime a turn without moving time. */
  async flush(): Promise<void> {
    await Effect.runPromise(Effect.yieldNow);
  }
}
