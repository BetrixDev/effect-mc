import { Commands } from "@effectmc/commands";
import { Events, Pdc, Plugin } from "@effectmc/core";
import { Effect, Layer } from "effect";
import { homeCommand, warpCommand } from "./commands";
import { Keys } from "./home";
import { PaperPlatform, PaperPlatformLive } from "./platform";
import { WarpLive, WarpService } from "./warp-service";

/**
 * The sample's finite program: attach one listener and two command trees, then
 * complete. Nothing here blocks; lifetime belongs to the runtime's scope
 * (ADR-0002).
 */
const program = Effect.gen(function* () {
  const platform = yield* PaperPlatform;

  yield* Events.attach(platform.playerJoin, { mode: "sync" }, (event) =>
    Effect.gen(function* () {
      const player = event.getPlayer();
      yield* Pdc.set(player, Keys.seen, player.getWorld().getName());
    }),
  );

  yield* Commands.attach(warpCommand);
  yield* Commands.attach(homeCommand);
});

export interface WarpsHomesOptions {
  /** Replaces the in-memory warp service, for example with a pre-seeded one. */
  readonly warps?: Layer.Layer<WarpService>;
  /** Replaces the Paper boundary; tests supply a fake event class and world lookup. */
  readonly platform?: Layer.Layer<PaperPlatform>;
}

/**
 * Builds the sample as a `Plugin` value. The default export uses the live
 * Layers; tests call this with fake Layers so the same program runs without a
 * server.
 */
export const makeWarpsHomes = (options: WarpsHomesOptions = {}) =>
  Plugin(
    "warps-homes",
    Layer.merge(options.warps ?? WarpLive, options.platform ?? PaperPlatformLive),
    program,
  );

export default makeWarpsHomes();
