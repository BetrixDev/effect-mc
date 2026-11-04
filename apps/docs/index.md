---
title: EffectMC design docs
description: Design notes and plugin patterns for EffectMC, a Paper plugin framework built on Effect v4 and GraalJS.
---

# EffectMC design docs

EffectMC lets you write Paper plugins in TypeScript with Effect v4 as the kernel, running on a GraalJS host.

**v0 in one line:** a GraalJS host, Effect Layers, unified `Events.of` Streams with `SyncWindow` cancel, minimal Brigadier-backed commands, and one warps/homes sample plugin that survives enable, caveated reload, and disable.

## Contents

### Design

| File | Topic |
| --- | --- |
| [overview](/design/overview) | Product, v0 cut, audience, prior art, pros and cons |
| [architecture](/design/architecture) | Stack, packages, GraalJS host, reload contract |
| [threading](/design/threading) | Main / AsyncThread, Graal Context, SyncWindow |
| [effect](/design/effect) | Effect v4 kernel, runtime, Scheduler, errors |
| [commands](/design/commands) | `@effectmc/commands` |
| [events](/design/events) | `Events.of` Streams and SyncWindow |
| [integrations](/design/integrations) | Soft-dependency packages |
| [ui](/design/ui) | Deferred `@effectmc/ui` |
| [roadmap](/design/roadmap) | Spikes, milestones, checklist |
| [decisions](/design/decisions) | Locked decisions |

### Patterns

| File | Topic |
| --- | --- |
| [overview](/patterns/) | How to read the patterns, event and PDC models, contracts |
| [bootstrap](/patterns/bootstrap) | Plugin entry |
| [commands](/patterns/commands) | A command tree |
| [events](/patterns/events) | Cancel and observe |
| [pdc](/patterns/pdc) | PersistentDataContainer with Schema keys |
| [axe-bolt](/patterns/axe-bolt) | Iron axe projectile with kill credit |
| [count-postgres](/patterns/count-postgres) | `/count` on Postgres via `@effect/sql-pg` |
| [services](/patterns/services) | Services and Layers (`WarpService`) |
| [offload](/patterns/offload) | `Paper.offload` and `Paper.on` |
| [errors](/patterns/errors) | Tagged errors |
| [warps](/patterns/warps) | Warps/homes sample slice |

### Reference

- [services and testing](/services-and-testing): Context services and the seams you can mock in tests

---

Living Pages these docs were exported from:

- Design notes: https://cursor.com/canvas/store-03b1ee30-3281-48df-97b9-37704deacccf/28dd6cb0-dea4-4c88-8fef-dd1be3788bf3
- Plugin patterns: https://cursor.com/canvas/store-03b1ee30-3281-48df-97b9-37704deacccf/82baac2c-c4d1-4c9b-ad92-970c3b7f4515
