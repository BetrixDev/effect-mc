import { Effect, Option } from "effect";
import { Main, MainThread, type RegionTarget } from "./threads";

/**
 * Enters `Main` for `target`. On Paper every region is the same, so a fiber
 * already holding `Main` is left where it is. Otherwise the host's
 * {@link MainThread} seam schedules the work on the server thread.
 *
 * The returned effect no longer requires `Main`; it never provides
 * `AsyncThread`, so a hop does not give async code world access by accident.
 */
export function on<A, E, R>(
  target: RegionTarget,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Main> | MainThread> {
  return Effect.gen(function* () {
    const current = yield* Effect.serviceOption(Main);
    const mainThread = yield* MainThread;

    if (Option.isSome(current)) {
      return yield* Effect.provideService(effect, Main, current.value);
    }

    return yield* mainThread.run(target, Effect.provideService(effect, Main, { region: target }));
  });
}

/** The thread-hop surface. `on` is the only hop v0 needs for async events. */
export const Paper = {
  on,
};
