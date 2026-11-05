---
title: Offload and hop
description: Paper.offload and Paper.on.
---

# Offload and hop

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

`Paper.offload` runs Java work on a pool. `Paper.on` hops onto the holder's or region's thread. JS never runs in parallel anywhere.

```typescript
const row = yield* Paper.offload(db.fetchHome(uuid))
yield* Paper.on(player, Effect.sync(() => player.teleport(row.toLocation())))
```

- After `offload`, the fiber resumes on the Context thread **without** `Main`.
- `Paper.on` provides `Main`. If `Main` is already present for the same region, it's a no-op merge.
- See [threading](/design/threading).
