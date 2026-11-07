import type { org } from "@effectmc/paper-types";
import { Context, Effect } from "effect";

/**
 * An entity or location that owns a region. On Paper the payload is always
 * absent; under Folia it names the holder whose region the fiber is on
 * (ADR-0007).
 */
export type RegionTarget = org.bukkit.entity.Entity | org.bukkit.Location;

/** The value carried by the `Main` capability. */
export interface MainValue {
  readonly region?: RegionTarget;
}

/**
 * Capability: Bukkit world APIs are legal here. It is a requirement in `R`,
 * not a hop; entering it is `Paper.on`'s job (ADR-0007).
 */
export class Main extends Context.Service<Main, MainValue>()("effectmc/Main") {}

/**
 * Capability: an async Bukkit context, with a time budget and no world access.
 * Async event attachments receive it instead of `Main` (ADR-0012).
 */
export class AsyncThread extends Context.Service<AsyncThread, void>()("effectmc/AsyncThread") {}

/**
 * The host seam behind `Paper.on`. A Paper host replaces this with a task
 * scheduled on the server thread; the default runs on the calling thread,
 * which is correct when JavaScript already runs on main.
 */
export interface MainThreadService {
  readonly run: <A, E, R>(
    target: RegionTarget,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

export class MainThread extends Context.Service<MainThread, MainThreadService>()(
  "effectmc/MainThread",
) {}

/** Runs the hop inline. Tests and single-threaded hosts use this. */
export const immediateMainThread: MainThreadService = {
  run: (_target, effect) => effect,
};

/**
 * The host seam behind `Paper.offload`. A Paper host runs the thunk on its
 * worker pool and resumes the fiber afterwards; the default runs it inline,
 * which keeps tests and single-threaded hosts working.
 */
export interface WorkerService {
  readonly run: <A>(thunk: () => A) => Effect.Effect<A>;
}

export class Worker extends Context.Service<Worker, WorkerService>()("effectmc/Worker") {}

/** Runs offloaded work inline. Tests and single-threaded hosts use this. */
export const immediateWorker: WorkerService = {
  run: (thunk) => Effect.sync(thunk),
};
