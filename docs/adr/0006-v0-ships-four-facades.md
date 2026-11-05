# ADR-0006: v0 ships four curated façades

- **Status:** Accepted (2026-11-03)

## Context

ADR-0003 made façades the documented API, which turns "how much of Paper do we wrap" into the size of the product surface. The pattern pages and the warps/homes sample exercise exactly four: `Sender`, `Players`, `Worlds`, `Items` (PDC writes on `ItemStack` only).

## Decision

v0 ships `Sender`, `Players`, `Worlds`, `Items`. Nothing else is curated. `Chat`, `BossBar`, `Scoreboard`, `Sounds`, and the rest are reachable as raw Bukkit and are not promised a façade.

## Consequences

- The façade surface grows only when a pattern needs it, so the maintenance burden against Paper version churn stays near zero at launch.
- Pages that show raw Bukkit for anything outside those four are correct by ADR-0003, and should say why they are raw rather than looking like an oversight.
- Adding a façade later is additive and safe. Removing one is not, which is why the default is to add none.
- `Items` is narrow on purpose: it exists for `editPdc`, not as an item-stack builder.
