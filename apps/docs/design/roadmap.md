---
title: Roadmap
description: Spikes, milestones, and the v0 checklist.
---

# Roadmap

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

## Steps

1. **Spike #0: timers.** Host Effect Scheduler, Clock, and promise drain on the Paper tick under Graal.
2. **Spike: vertical slice.** Load a TS plugin with one Brigadier command, one `Events.of` cancel, one observe stream, and one `Paper.offload`.
3. **Spike: reload leaks.** Close the Context 50× with players online, confirm the Registry empties, and check the heap.
4. **Sample plugin.** Warps/homes: prove enable, use, caveated reload, and disable.
5. **`@effectmc/test`.** Mock Layer plus fake senders and events, before LuckPerms or UI.
6. **UI / Folia / bus.** Only once the sample plugin is boring.

## Checklist

- [ ] Host Scheduler/Clock + promise drain on tick *(blocker)*
- [ ] `Events.of` Stream + `SyncWindow` cancel (`runSyncExit` push) *(blocker)*
- [ ] Java Registry before `context.close`; 50× reload leak test *(blocker)*
- [ ] Measure Graal interpreter-only on stock JDK 21 *(host)*
- [ ] Command tree at load; hot-swappable handlers; permission re-check *(commands)*
- [ ] Async event path (no main hop) documented + implemented *(events)*
- [ ] `Main` / `AsyncThread` tags + façades require `Main`; `Paper.on` no-op if already `Main` *(threads)*
- [ ] Dev assert `ThreadBoundaryError` when a `Main` API is used off-thread *(threads)*
- [ ] Keyed `.events` fan-out; high-frequency events off Streams *(events)*
- [ ] Warps/homes sample: enable → use → caveated reload → disable *(v0 milestone)*
- [ ] Java + TS listeners on the same event: priority order + `ignoreCancelled` *(spike)*
- [ ] `HostAccess` allow-list; no `allowAll` *(host)*
- [ ] Perf smoke + fast-path escape if Graal is too slow *(host)*
- [ ] `@effectmc/test` mock Layer *(test)*
- [ ] Codegen typings + curated Effect façade *(decided lean)*
- [ ] Register effectmc.com / .dev *(branding)*
- [ ] `llms.txt` + tutorial ladder *(docs)*
- [ ] `@effectmc/ui` (InvUI patterns) *(deferred)*
- [ ] Folia / cross-plugin bus / Javet *(deferred)*
