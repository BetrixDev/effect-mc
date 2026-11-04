---
title: Axe bolt
description: An iron axe projectile with a particle trail and kill credit.
---

# Axe bolt

When a player right-clicks with an iron axe, the plugin launches a snowball bolt tagged in PDC and forks a scoped particle trail. When the bolt hits an entity, it deals lethal damage with the clicking player as the killing source (`LivingEntity.damage(amount, player)`).

```typescript
import { Effect, Layer, Stream, Schema, Schedule, Option } from "effect"
import { EffectMC, Events, Pdc, Paper } from "@effectmc/core"

const Keys = Pdc.namespace("demo", {
  axeBolt: Schema.Boolean, // mark our projectiles
})

const isIronAxe = (stack: ItemStack | null) =>
  stack != null && stack.type === Material.IRON_AXE

/** Particle trail until the projectile dies; scoped → cancelled on reload. */
const trail = (bolt: Snowball) =>
  Effect.gen(function* () {
    yield* Effect.repeat(
      Paper.on(bolt, Effect.sync(() => {
        if (!bolt.isValid()) return
        bolt.world.spawnParticle(
          Particle.CRIT,
          bolt.location,
          4,
          0.08,
          0.08,
          0.08,
          0.01,
        )
      })),
      Schedule.spaced("50 millis").pipe(
        Schedule.intersect(Schedule.recurWhile(() => bolt.isValid())),
      ),
    )
  }).pipe(Effect.forkScoped)

const fireBolt = (player: Player) =>
  Paper.on(
    player,
    Effect.gen(function* () {
      if (player.hasCooldown(Material.IRON_AXE)) return
      player.setCooldown(Material.IRON_AXE, 10) // 0.5s

      const bolt = player.launchProjectile(Snowball.class)
      bolt.setShooter(player)
      bolt.setGravity(true)
      // velocity already from look; bump it for a snappier shot
      bolt.velocity = player.location.direction.multiply(1.6)

      yield* Pdc.set(bolt, Keys.axeBolt, true)
      yield* trail(bolt)
    }),
  )

/** Right-click iron axe → launch. Cancel block use so we don't strip logs / till. */
const launchOnClick = Events.of(PlayerInteractEvent, {
  ignoreCancelled: true,
}).pipe(
  Stream.runForEach((event) =>
    Effect.gen(function* () {
      if (!event.action.isRightClick()) return
      if (!isIronAxe(event.item)) return
      yield* event.cancel // sync — still in SyncWindow
      yield* fireBolt(event.player) // Paper.on may suspend; cancel already done
    }),
  ),
)

/** Hit living entity → instant kill credited to the shooter. */
const killOnHit = Events.of(ProjectileHitEvent, {
  ignoreCancelled: true,
}).pipe(
  Stream.runForEach((event) =>
    Effect.gen(function* () {
      const proj = event.entity
      if (!(proj instanceof Snowball)) return

      const marked = yield* Paper.on(proj, Pdc.get(proj, Keys.axeBolt))
      if (Option.isNone(marked) || !marked.value) return

      const hit = event.hitEntity
      const shooter = proj.shooter
      if (
        hit instanceof LivingEntity &&
        shooter instanceof Player &&
        hit.uniqueId !== shooter.uniqueId
      ) {
        yield* Paper.on(
          hit,
          Effect.sync(() => {
            // amount + Player source → death message / stats / guardians see the player
            hit.damage(Number.MAX_VALUE, shooter)
          }),
        )
      }

      yield* Paper.on(proj, Effect.sync(() => proj.remove()))
    }),
  ),
)

export const axeBoltLive = Effect.gen(function* () {
  yield* Effect.all([launchOnClick, killOnHit], { concurrency: "unbounded" })
})

// plugin.ts
EffectMC.Plugin("demo", Layer.empty, axeBoltLive)
```

## Why this shape

- Cancel the interact while `SyncWindow` is open, then use `Paper.on` for the spawn, damage, and PDC work.
- Tag the snowball with `Keys.axeBolt` so vanilla snowballs aren't affected.
- The `forkScoped` trail ends with the plugin Scope on reload.
- Kill credit comes from the `damage(amount, Player)` source, not from `setHealth(0)`.

## Variations

- You can swap the Snowball for an Arrow, a wind charge, or a custom display entity the same way. Keep the shooter and the PDC mark.
- On Paper 1.20.5+, use `DamageSource.builder().withCausingEntity(player).withDirectEntity(proj)` if you need finer-grained death reasons.
- The trail uses `Schedule` on the tick-pumped Effect clock, not a raw `BukkitRunnable`.
