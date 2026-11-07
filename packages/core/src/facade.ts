import { Effect } from "effect";
import { Main } from "./threads";

/**
 * Declares the `Main` capability and runs a synchronous Bukkit call under it.
 * This is a capability declaration, not a hop: callers reach it through
 * `Paper.on` or run inside a surface that already holds `Main`.
 */
export const inMain = <A>(thunk: () => A): Effect.Effect<A, never, Main> =>
  Effect.gen(function* () {
    yield* Main;
    return yield* Effect.sync(thunk);
  });
