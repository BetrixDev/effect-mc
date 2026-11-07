import type { Block, Location, Material, World } from "@effectmc/paper-types";
import type { Effect } from "effect";
import { inMain } from "./facade";
import type { Main } from "./threads";

/**
 * The world façade. Block reads and writes are region-bound, so both carry
 * `Main` in `R` (ADR-0003, ADR-0006).
 */
export const Worlds = {
  /** Reads the block at a location. */
  blockAt: (world: World, location: Location): Effect.Effect<Block, never, Main> =>
    inMain(() => world.getBlockAt(location)),

  /** Replaces the block at a location's coordinates. */
  setBlock: (
    world: World,
    location: Location,
    material: Material,
  ): Effect.Effect<void, never, Main> =>
    inMain(() => {
      world.setType(location.getBlockX(), location.getBlockY(), location.getBlockZ(), material);
    }),
};
