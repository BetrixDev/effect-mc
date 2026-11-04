---
title: Overview
description: Product positioning, the v0 cut, audience, prior art, and tradeoffs.
---

# Overview

## Product

**EffectMC** (effectmc.com / effectmc.dev). You write Paper plugins in TypeScript, and Effect is the kernel. The shape follows Alchemy's split between declaring and running. It is an application framework, not a thin Graal script host.

Don't use the name *FlamePaper*. An existing Paper 1.8.8 fork already has it.

- **Kernel:** Effect v4 idioms (`Context.Service`, Layers, Scope, Stream, Schema).
- **Surface:** we market it as a Paper framework: commands, events, scheduling, persistent data.
- **Docs:** ship `llms.txt` and a short tutorial ladder.

## v0 cut

> **Ship:** a GraalJS host, Effect Layers, unified `Events.of` Streams (with `SyncWindow` cancel), minimal commands, and one sample plugin (warps/homes) that survives enable, caveated reload, and disable.
>
> **Defer:** inventory TEA UI, the LuckPerms package, a cross-plugin bus, Folia, and a Javet dual runtime.
>
> **Hot reload is caveated** developer convenience until a 50× reload leak spike passes. Don't market it as production-safe.

## Audience

Effect-first. Minecraft is a host for Effect apps, which is why the product is named EffectMC. The docs still **lead with Paper tasks** (register a command, cancel an event, schedule work) so Paper-native authors can start before they learn Effect theory.

## Prior art and the gap

Other projects already run JavaScript on Paper: Grakkit, EcmaCraft, PaperScript, PaperTS. What none of them provide is an **application framework**:

- dependency injection and Layers
- a lifecycle Registry for mechanical teardown
- typed commands and events
- a test Layer
- a curated Paper façade

The current cut came out of critiques from several angles: Alchemy patterns, Effect feasibility, Paper/Bukkit reality, craftsmanship, and a chief-of-staff view of scope.

## Building blocks

- **Host:** one GraalJS owner plugin. Libraries load through `PluginLoader`. Never relocate `org.graalvm.*`.
- **Types:** typings generated per Minecraft jar, plus manual patches, plus a thin Effect façade for everyday APIs.
- **Core:** one `ManagedRuntime` per plugin, a tick-driven Scheduler/Clock, `Events.of` plus the `Main`/`AsyncThread` tags, and commands.
- **Later packages:** `@effectmc/ui`, `@effectmc/luckperms`, and `@effectmc/test`. The test package comes early, alongside core.

## Pros and cons

**Pros**

- Effect gives typed dependency injection, typed errors, and interruption.
- `SyncWindow` plus `Main`/`AsyncThread` in `R` make cancellation and thread hops obvious.
- A declarative Plugin plus the Registry makes reload teardown mechanical.
- Alchemy-style layers turn soft dependencies into compile-time requirements.

**Cons**

- A Graal Context is single-threaded, and a stock JDK may run it interpreter-only.
- Paper's Lifecycle API can't hot-swap the shape of the command tree.
- Effect has a learning curve, and the typing patches are ongoing debt.
- No Folia in v1.
