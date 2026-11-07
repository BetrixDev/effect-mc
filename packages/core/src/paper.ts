import type { Location } from "@effectmc/paper-types";
import { Effect, Option } from "effect";
import { Main, MainThread, type MainValue, type RegionTarget, Worker } from "./threads";

const isLocationTarget = (target: RegionTarget): target is Location => {
  const candidate = target as Partial<Location>;
  return (
    typeof candidate.getWorld === "function" &&
    typeof candidate.getX === "function" &&
    typeof candidate.getY === "function" &&
    typeof candidate.getZ === "function"
  );
};

const sameLocation = (left: Location, right: Location): boolean =>
  left === right ||
  (left.getWorld() === right.getWorld() &&
    left.getX() === right.getX() &&
    left.getY() === right.getY() &&
    left.getZ() === right.getZ());

/**
 * On Paper `region` is absent, so any Main is the one region. Under Folia the
 * payload names the owner, and only the same owner is already on Main.
 */
const sameRegion = (current: MainValue, target: RegionTarget): boolean => {
  if (current.region === undefined || current.region === target) {
    return true;
  }

  return (
    isLocationTarget(current.region) &&
    isLocationTarget(target) &&
    sameLocation(current.region, target)
  );
};

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

    if (Option.isSome(current) && sameRegion(current.value, target)) {
      return yield* Effect.provideService(effect, Main, current.value);
    }

    const mainThread = yield* MainThread;
    return yield* mainThread.run(target, Effect.provideService(effect, Main, { region: target }));
  });
}

/**
 * Runs a synchronous Java thunk on a worker and resumes the fiber without
 * `Main`. The returned effect requires only the {@link Worker} seam, so it is
 * legal from an async handler and does not grant world access.
 */
export function offload<A>(thunk: () => A): Effect.Effect<A, never, Worker> {
  return Effect.gen(function* () {
    const worker = yield* Worker;
    return yield* worker.run(thunk);
  });
}

/** The thread-hop surface: enter `Main` or run work on a worker. */
export const Paper = {
  on,
  offload,
};
