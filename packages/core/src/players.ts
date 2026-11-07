import type { Location, Player } from "@effectmc/paper-types";
import type { Effect } from "effect";
import { inMain } from "./facade";
import type { Main } from "./threads";

/**
 * The player façade. It wraps the world-mutating calls the v0 patterns need
 * and carries `Main` in `R` (ADR-0003, ADR-0006).
 */
export const Players = {
  /** Teleports a player and reports whether Paper accepted the move. */
  teleport: (player: Player, location: Location): Effect.Effect<boolean, never, Main> =>
    inMain(() => player.teleport(location)),
};
