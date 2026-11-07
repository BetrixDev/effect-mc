import type { TimerHandle, Timers } from "../dev-loop";

/** A deterministic timer seam for debounce tests. */
export class ManualTimers implements Timers {
  #next = 1;
  #now = 0;
  #timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, milliseconds: number): TimerHandle {
    const handle = this.#next++;
    this.#timers.set(handle, { at: this.#now + milliseconds, callback });
    return handle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.#timers.delete(handle as number);
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
    for (const [handle, timer] of this.#timers) {
      if (timer.at <= this.#now) {
        this.#timers.delete(handle);
        timer.callback();
      }
    }
  }
}
