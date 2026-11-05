---
title: Plugin patterns
description: How to read the patterns, the event and PDC models, and the contracts.
---

# EffectMC plugin patterns

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

## How to read these

These are illustrative TypeScript snippets against the EffectMC surface: `Plugin`, `Events.of`, `Pdc`, `@effectmc/commands`, `Paper.offload` / `Paper.on`. **The API isn't shipping yet.**

The patterns stick to APIs shaped for v0. Inventory TEA UI and LuckPerms adapters are left out. PDC can ship with core, because it's a thin layer over Paper and pairs cleanly with Schema.

## Event model

Everything is an Effect `Stream`. `Events.of(Type)` and the named and keyed helpers return an `EventStream`. You can cancel only while `SyncWindow` is in `R`, which is the unbuffered push inside the Bukkit listener. Buffering, debouncing, or async work drops the window, and `event.cancel` no longer typechecks.

- The host pushes each dispatch with `runSyncExit` before the listener returns.
- `Events.run` = `of` + `runForEach`. It's sugar, not a second API.
- Keyed fan-out (`player.events.chat`) has the same `EventStream` shape.

## PDC model

PDC uses Schema keys, not raw `PersistentDataType`. A typed key is a `NamespacedKey` plus an Effect `Schema` codec, which maps to a `PersistentDataType`. Reads return `Option` or a tagged decode error. Writes run on the holder's thread through `Paper.on`.

- Primitives map to `STRING`, `INTEGER`, `LONG`, `DOUBLE`, `BYTE_ARRAY`, `BOOLEAN`, and so on.
- Structs map to a nested `TAG_CONTAINER`. Prefer that over one blob, so you can update fields separately.
- `Pdc.namespace` builds the key table. For an `ItemStack`, go through `Items.editPdc`.

## Contracts to keep

| Contract | Rule |
| --- | --- |
| Events | One surface: `Events.of` / named / `.events` → Stream. `Events.run` is sugar |
| Cancel | `event.cancel` needs `SyncWindow`. The first suspend ends it |
| PDC | `Pdc.Key` = `NamespacedKey` + Schema codec. Get and set on the holder's thread |
| Threads | `Main` / `AsyncThread` in `R`. `Paper.on` provides `Main`. `offload` uses the Java pool. JS never runs in parallel |
| Scoped fibers | Run trails and loops with `forkScoped`, so Registry/Scope teardown stops them |
| Reload | Registry teardown → `context.close` → start again. Command shape is fixed |

## Patterns

- [bootstrap](/patterns/bootstrap): plugin entry
- [commands](/patterns/commands): a `/warp go` command tree
- [events](/patterns/events): cancel and observe
- [pdc](/patterns/pdc): Schema-typed persistent data
- [axe-bolt](/patterns/axe-bolt): the worked combat example
- [count-postgres](/patterns/count-postgres): `/count` on Postgres
- [services](/patterns/services): `WarpService` as a Layer
- [offload](/patterns/offload): worker hops
- [errors](/patterns/errors): tagged errors
- [warps](/patterns/warps): the warps/homes sample slice

See also [threading](/design/threading) and [services and testing](/services-and-testing).
