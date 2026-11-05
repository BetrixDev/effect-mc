# ADR-0009: `Pdc` ships inside `@effectmc/core`

- **Status:** Accepted (2026-11-03)

## Context

`patterns/index.md:12` leans toward PDC shipping with core ("it's a thin layer over Paper and pairs cleanly with Schema"), while `design/architecture.md` lists PDC among core's responsibilities and gives it no package of its own.

The alternatives were a dedicated `@effectmc/pdc` or folding it into `@effectmc/paper-types`.

## Decision

`Pdc` is part of `@effectmc/core`.

## Consequences

- One install for anyone who persists anything. Persistent data is not an optional capability in a Minecraft plugin.
- Core grows a Paper-shaped concern. It already owns façades and the Registry, so this does not cross a new boundary.
- `paper-types` stays purely generated plus patch overlays; hand-written policy there would fight codegen.
- If PDC later grows enough to justify its own package, extracting it is a rename plus re-export, not a redesign — which is why this is the cheap direction to be wrong in.
