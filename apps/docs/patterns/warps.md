---
title: Warps/homes sample
description: The v0 sample slice.
---

# Warps/homes sample

This is the v0 sample slice. Global warps live in a service `Ref` (see [services](/patterns/services)), and each player's `/home` lives in their PDC.

```typescript
const Home = Schema.Struct({
  world: Schema.UUID,
  x: Schema.Number,
  y: Schema.Number,
  z: Schema.Number,
  yaw: Schema.Number,
  pitch: Schema.Number,
})

const Keys = Pdc.namespace("homes", { home: Home })

const fromLocation = (l: Location) => ({
  world: l.world.uid, x: l.x, y: l.y, z: l.z, yaw: l.yaw, pitch: l.pitch,
})

const setHome = Command.make("sethome", {}, () =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer
    yield* Paper.on(player, Pdc.set(player, Keys.home, fromLocation(player.location)))
  }),
)
```

This sample is what proves the v0 milestone: enable → use → caveated reload → disable.
