import { Context, Effect } from "effect";

/**
 * An entity or location that owns a region. On Paper the payload is always
 * absent; under Folia it names the holder whose region the fiber is on
 * (ADR-0007).
 */
export type RegionRef = object;

/** The value carried by the `Main` capability. */
export interface MainValue {
  readonly region?: RegionRef;
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
    target: RegionRef,
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
