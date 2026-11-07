import type { Location } from "@effectmc/paper-types";
import { Context, Effect, Layer, Option, Ref, Schema } from "effect";

/**
 * A `/warp go` for a name the service does not hold. The field is called
 * `warp`, never `name`, because a `name` field on a Schema error silently
 * replaces `Error.name` (ADR-0005).
 */
export class WarpNotFound extends Schema.TaggedError<WarpNotFound>()("WarpNotFound", {
  warp: Schema.String,
  message: Schema.String,
}) {}

/** The sample's global-warp store. A service, so commands never own state. */
export interface WarpServiceShape {
  readonly set: (name: string, location: Location) => Effect.Effect<void>;
  readonly get: (name: string) => Effect.Effect<Location, WarpNotFound>;
  readonly list: Effect.Effect<ReadonlyArray<string>>;
}

export class WarpService extends Context.Service<WarpService, WarpServiceShape>()(
  "warps-homes/WarpService",
) {}

/**
 * In-memory warps, scoped to one plugin runtime. A caveated reload rebuilds
 * this Layer, so warps reset while a player's PDC home survives (ADR-0017).
 */
export const WarpLive: Layer.Layer<WarpService> = Layer.effect(
  WarpService,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, Location>());

    return {
      set: (name, location) => {
        const saved = location.clone();
        return Ref.update(store, (warps) => new Map(warps).set(name, saved));
      },
      get: (name) =>
        Ref.get(store).pipe(
          Effect.flatMap((warps) =>
            Option.match(Option.fromNullishOr(warps.get(name)), {
              onNone: () =>
                Effect.fail(
                  new WarpNotFound({
                    warp: name,
                    message: `Warp '${name}' is not set.`,
                  }),
                ),
              onSome: (location) => Effect.succeed(location.clone()),
            }),
          ),
        ),
      list: Ref.get(store).pipe(Effect.map((warps) => [...warps.keys()].sort())),
    };
  }),
);
