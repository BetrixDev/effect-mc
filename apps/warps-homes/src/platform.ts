import type { EventClass } from "@effectmc/core";
import type { Location, PlayerJoinEvent, World } from "@effectmc/paper-types";
import { Context, Layer } from "effect";
import type { Home } from "./home";

/**
 * The sample's narrow Paper boundary. `@effectmc/paper-types` is types only, so
 * the two values the sample needs at runtime — the join event class and a
 * world lookup — come through this seam. A host with the GraalJS Java bridge
 * uses {@link PaperPlatformLive}; a test supplies a fake Layer.
 */
export interface PaperPlatformService {
  readonly playerJoin: EventClass<PlayerJoinEvent>;
  /** Turns a persisted home back into a live location, or `undefined` if its world is not loaded. */
  readonly resolveHome: (home: Home) => Location | undefined;
}

export class PaperPlatform extends Context.Service<PaperPlatform, PaperPlatformService>()(
  "warps-homes/PaperPlatform",
) {}

interface JavaBridge {
  readonly type: (name: string) => unknown;
}

interface WorldLookup {
  readonly getWorld: (name: string) => World | null | undefined;
}

type LocationConstructor = new (
  world: World,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
) => Location;

const java = (): JavaBridge => {
  const bridge = (globalThis as { readonly Java?: JavaBridge }).Java;
  if (bridge === undefined) {
    throw new Error(
      "The warps-homes sample needs the host's GraalJS Java bridge to reach Paper's event and world classes. " +
        "A host without that bridge must provide PaperPlatform.",
    );
  }
  return bridge;
};

/** The Paper implementation, built lazily so importing the module never touches Java. */
export const PaperPlatformLive: Layer.Layer<PaperPlatform> = Layer.sync(PaperPlatform, () => ({
  playerJoin: java().type("org.bukkit.event.player.PlayerJoinEvent") as EventClass<PlayerJoinEvent>,
  resolveHome: (home) => {
    const world = (java().type("org.bukkit.Bukkit") as WorldLookup).getWorld(home.world);
    if (world === null || world === undefined) {
      return undefined;
    }

    const LocationClass = java().type("org.bukkit.Location") as LocationConstructor;
    return new LocationClass(world, home.x, home.y, home.z, home.yaw, home.pitch);
  },
}));
