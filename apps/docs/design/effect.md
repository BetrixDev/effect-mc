---
title: Effect kernel
description: Effect v4 services, Layers, the tick Scheduler, errors, and observability.
---

# Effect kernel

- **Effect v4.** Services are tags, and implementations are Layers.
- **One `ManagedRuntime` per plugin.** Disposing it is the first step of teardown.
- **Tick Scheduler and Clock.** Graal has no event loop. The host provides an Effect Scheduler and Clock that the Paper tick pumps, and it drains promise microtasks on every tick.
- **Thread boundaries live in `R`** as `Main` / `AsyncThread`. See [threading](/design/threading).

```typescript
yield* Paper.offload(db.fetchHomes(uuid)) // Java pool; resumes without Main
yield* Paper.on(player, Players.teleport(player, loc)) // provides Main

// The Scheduler is location/entity-aware (leaves the door open for Folia; v1 has no Folia)
```

## Capabilities in `R`

`Main` / `AsyncThread`, `Command.permission`, and soft dependencies all appear as requirements in `R`. Each integration's `X.layer()` satisfies its requirement.

## Errors and observability

- Tagged errors (`PermissionDenied`, `ThreadBoundaryError`, `PdcDecodeError`, `SqlError`, and others) plus an Adventure renderer at command and handler boundaries.
- `Effect.withSpan` on commands and handlers. `Observability.layer` can be swapped out.

## Cross-plugin bus

Post-v0. Each plugin's Context is an island. A later bus would encode messages with Schema and route them through the host.
