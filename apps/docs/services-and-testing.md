---
title: Services and testing seams
description: Context services and the seams you can mock in tests.
---

# Services and testing seams

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

Every service below is an Effect Context service or Layer. Each one can be mocked by providing a replacement Layer from `@effectmc/test`, so plugin logic runs in unit tests without a Paper server.

| Service | Role | Test seam |
| --- | --- | --- |
| `Sender` | Command source, Adventure messages, `asPlayer` | Fake sender that records messages |
| `Pdc` / key namespaces | Typed persistent data | In-memory container |
| `Main` | Capability: world APIs are legal here (not a hop) | Provided directly |
| `AsyncThread` | Capability: async Bukkit context | Provided directly |
| `Paper` | `on` / `offload` hops | Immediate / no-op implementation |
| `Events` | Event bus and `Events.of` registration | Fake event emitter |
| `Commands` | Register and dispatch (Brigadier) | Fake Brigadier, `runWith` args |
| `Players` / `Worlds` / `Items` | Curated facades that require `Main` | Mock world state |
| `PluginRef` | `JavaPlugin` and `NamespacedKey` factory | Stub plugin |
| `Scheduler` / `Clock` | Tick-pumped Effect time | `TestClock`, manual tick pump |
| `Registry` | Listener, task, and command teardown | Inspectable registry, so tests can assert it's empty after dispose |
| `SqlClient` | From `@effect/sql` | Swap `PgClient` for SQLite or JDBC test Layers |
| Soft deps (`LuckPerms`, Vault, ...) | Optional `X.layer()` | Mock adapter Layers |
| Observability / `withSpan` | Tracing Layer | No-op or in-memory span collector |

Tagged errors and the Observability Layer are cross-cutting, and tests can swap them too.
