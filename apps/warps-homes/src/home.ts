import { Pdc } from "@effectmc/core";
import type { Location } from "@effectmc/paper-types";
import { Schema } from "effect";

/**
 * The persisted half of a home. A `Location` is a live Java object and cannot
 * be stored in a PDC, so the sample keeps the world name and the coordinates
 * that a home actually needs (ADR-0014).
 */
export const Home = Schema.Struct({
  world: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  z: Schema.Number,
  yaw: Schema.Number,
  pitch: Schema.Number,
});

export type Home = Schema.Schema.Type<typeof Home>;

/**
 * The sample's persistent-data namespace. `home` is the player's saved home;
 * `seen` records the world the player was last seen in, written by the join
 * listener to prove that listener teardown is real.
 */
export const Keys = Pdc.namespace("warps-homes", {
  home: Home,
  seen: Schema.String,
});

/**
 * Captures a live location as the plain value a PDC can store.
 *
 * v0 has no location-reading façade, so this is a raw Bukkit read — the
 * documented escape hatch (ADR-0003). World mutation still goes through
 * `Players.teleport`.
 */
export const homeFrom = (location: Location): Home => ({
  world: location.getWorld().getName(),
  x: location.getX(),
  y: location.getY(),
  z: location.getZ(),
  yaw: location.getYaw(),
  pitch: location.getPitch(),
});

/** A `/home go` with no stored home. */
export class HomeNotSet extends Schema.TaggedError<HomeNotSet>()("HomeNotSet", {
  message: Schema.String,
}) {}

/** A stored home whose world is not loaded. */
export class HomeWorldMissing extends Schema.TaggedError<HomeWorldMissing>()("HomeWorldMissing", {
  world: Schema.String,
  message: Schema.String,
}) {}
