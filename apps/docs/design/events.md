---
title: Events
description: Events.of Streams, SyncWindow cancel, and keyed fan-out.
---

# Events

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

## One surface: Streams plus SyncWindow

There's no split between `Events.on` and `Events.stream`. Authors always call `Events.of(Type)` (or the named helpers and keyed `.events`) and get an Effect `Stream`.

- The host pushes each Bukkit dispatch into the stream with `runSyncExit` **before the Java listener returns**.
- `event.cancel` requires `SyncWindow` in `R`. `SyncWindow` is present only during that unbuffered sync push.
- Buffering, debouncing, sleeping, offloading, or forking drops the window. The element becomes a snapshot, and `cancel` no longer typechecks.
- This matches MCCoroutine: the first real suspend ends the window. If you race a cancel, you get `AsyncInCancellableHandler`.

## Examples

```typescript
// Same API for cancel and observe
Events.of(BlockBreakEvent, { priority: "high", ignoreCancelled: true }).pipe(
  Stream.runForEach((event) =>
    Effect.gen(function* () {
      if (!(yield* claims.canBreakSync(event.player, event.block))) {
        yield* event.cancel // needs SyncWindow
      }
    }),
  ),
)
```

```typescript
// Observe: named and keyed streams
yield* Events.playerJoined.pipe(Stream.runForEach(onJoin))
yield* player.events.chat.pipe(
  Stream.filter(isBang),
  Stream.runForEach((e) => handleBang(player, e.message())),
)
```

```typescript
// Sugar only, with the same semantics as Events.of + Stream.runForEach
yield* Events.run(BlockBreakEvent, (e) => Effect.gen(function* () {
  if (bad) yield* e.cancel
}))
```

## Notes

- **Fan-out:** there is one Java listener per event type. Keyed `.events` (for example `player.events.chat`) fan out from it with the same `EventStream` shape.
- **Snapshots:** the live Bukkit event never escapes the sync push. Observers past the window get snapshots.
- **High-frequency events** (`PlayerMoveEvent`, physics): leave them out, or filter them lightly in the sync push. Heavy Streams stall the tick.
- **Async Bukkit events:** they use the same `Events.of`, running on the async thread with a timeout and no hop to main. Handlers get `AsyncThread`, not `Main`.
- **Java and TS interop:** Java and TS listeners on the same event still respect `priority` and `ignoreCancelled` order.
