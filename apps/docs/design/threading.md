---
title: Threading model
description: Main and AsyncThread capabilities, Graal Context, and SyncWindow.
---

# Threading model

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

A core product goal is to make it **obvious from the types** when code runs on the main (or region) thread and when it runs asynchronously. Hop helpers alone (`Paper.on` / `Paper.offload`) don't do that, so EffectMC defines typed boundaries.

## Three separate axes

People often mix these up. EffectMC keeps them apart:

| Axis | Meaning | What the author sees |
| --- | --- | --- |
| Bukkit thread | Where Java world APIs are legal: main/region thread, async event thread, or worker | `Main` / `AsyncThread` in the Effect `R` channel |
| Graal Context | Where JS bytecode runs | Always one owner thread per plugin. JS never runs in parallel |
| Effect synchrony | `runSyncExit` compared with a suspended fiber | `SyncWindow` for cancel. A sleep, offload, or fork ends it |

## Typed capabilities

- Curated façades (teleport, PDC, inventory, setting blocks) **require `Main` in `R`**.
- Async Bukkit handlers get **`AsyncThread`** instead, so world APIs don't typecheck there. To get `Main`, call `Paper.on(target, …)`.
- Pure CPU or Schema work needs neither capability.
- `Paper.offload` runs a Java thunk on a worker and resumes the fiber on the Context thread, **without** `Main`.

> **`yield* Main` doesn't move you.** It declares a requirement (and reads the service). The effect then has to run somewhere that provides `Main`. The only hops are `Paper.on`, which provides `Main`, and `Paper.offload`, which runs on a worker and resumes without `Main`. A bare `yield* Main` with no provider in scope fails as a missing service. It doesn't hop.

## Examples

### Tags

```typescript
// Tags (simplified)
class Main extends Context.Tag("Main")<Main, { readonly region?: Entity | Location }>() {}
class AsyncThread extends Context.Tag("AsyncThread")<AsyncThread, void>() {}
```

### `Paper.on`: enter Main

The entity or location picks the region, which keeps the code ready for Folia.

```typescript
yield* Paper.on(player, Effect.gen(function* () {
  yield* Main // present
  yield* Players.teleport(player, loc) // Effect<…, Main>
  yield* Pdc.set(player, Keys.home, home)
}))
```

### `Paper.offload`: Java on a worker, no Main on resume

```typescript
const row = yield* Paper.offload(() => db.fetch(uuid))
yield* Paper.on(player, Players.teleport(player, row.toLocation()))
```

### Async Bukkit event: AsyncThread, not Main

```typescript
Events.of(AsyncChatEvent).pipe(
  Stream.runForEach((e) =>
    Effect.gen(function* () {
      yield* AsyncThread
      // Players.teleport(…) // ← does not compile
      yield* Paper.on(e.player, sendStyled(e.player, e.message()))
    }),
  ),
)
```

### Sync event cancel

For sync events, the cancel window implies `Main`. Cancel before any hop that suspends.

```typescript
Events.of(BlockBreakEvent).pipe(
  Stream.runForEach((e) =>
    Effect.gen(function* () {
      if (bad) yield* e.cancel // SyncWindow + Main
      // after cancel you may fork work that calls Paper.on later
    }),
  ),
)
```

## Rules

- Commands execute with `Main`, because Paper runs them on the server or region thread.
- Suggestions and async events get `AsyncThread`. They have a time budget and can't touch the world without `Paper.on`.
- The tick Scheduler pump often enters the Context while already on main. The types still require `Main`, so they stay honest once Folia arrives.
- The docs lead with three rules: *Need the world? Wrap it in `Paper.on`. Heavy Java work? Use `Paper.offload`. Need to cancel? Do it before the first suspend.*
- In dev builds, calling a `Main` façade without `Main` throws `ThreadBoundaryError` at runtime.

## Pros and cons

**Pros**

- Thread boundaries are clear at compile time. That sets EffectMC apart from raw Bukkit and other JS hosts.
- The same tags support Folia later without rewriting plugins.
- The model pairs with `SyncWindow` and doesn't add a fourth concept.

**Cons**

- `R` carries more noise until the façades hide it.
- It's easy to wrap `Paper.on` around code that's already on Main. To mitigate this, `Paper.on` is a no-op merge when `Main` is already present for the same region.
- Graal still runs JS serially. "Async" never means parallel TypeScript.
