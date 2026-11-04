---
title: Decisions
description: Locked decisions so far.
---

# Decisions

| Property | Decision |
| --- | --- |
| Product | EffectMC (effectmc.com / .dev) |
| Audience | Effect-first, with Minecraft as the host. Docs lead with Paper tasks |
| Events / cancel | One Stream surface (`Events.of`). `event.cancel` needs `SyncWindow`. The first suspend ends the window |
| Effect | v4. One `ManagedRuntime` per plugin, a tick Scheduler, tagged errors, and spans |
| Host | GraalJS only in v0. One Context per plugin, no relocation, no Folia in v1 |
| Reload | Caveated developer convenience. Registry teardown. Command shape is fixed, handlers can be swapped |
| Event sugar | `Events.run` = `of` + `runForEach`. Named streams plus keyed `.events` |
| Commands | `@effectmc/commands`, inspired by effect/cli and thin over Brigadier. `Command.permission` |
| Threads | `Main` / `AsyncThread` in `R`. `Paper.on` provides `Main`. `offload` uses the Java pool. JS never runs in parallel. `SyncWindow` is a separate axis |
| v0 cut | Host, events, minimal commands, and the sample plugin. UI and LuckPerms are deferred |
| Test | `@effectmc/test` ships early, leaning on Alchemy's `Test.make` |
| Typings | Codegen plus patches plus a curated façade |
