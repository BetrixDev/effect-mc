---
title: Events
description: Cancel and observe with the same Stream.
---

# Events

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

Cancel and observe use the same Stream. You cancel with `event.cancel` while `SyncWindow` is open.

```typescript
export const protection = Events.of(BlockBreakEvent, {
  priority: "high",
  ignoreCancelled: true,
}).pipe(
  Stream.runForEach((event) =>
    Effect.gen(function* () {
      if (!(yield* claims.canBreakSync(event.player, event.block))) {
        yield* event.cancel
      }
    }),
  ),
)
```

Equivalent sugar:

```typescript
yield* Events.run(BlockBreakEvent, (event) =>
  Effect.gen(function* () {
    if (!(yield* claims.canBreakSync(event.player, event.block))) {
      yield* event.cancel
    }
  }),
)
```

See [events](/design/events).
