# ADR-0003: Curated façades are the API; raw Bukkit is an escape hatch

- **Status:** Accepted (2026-11-03)

## Context

The docs contradicted themselves: `patterns/commands.md:28` called `player.teleport(loc)` directly, while `design/threading.md:46` called `Players.teleport(player, loc)`.

This is decisive rather than cosmetic. The product's stated differentiator is that thread boundaries are visible in the types. Raw Bukkit signatures are fixed Java and cannot carry `Main` in `R`, so only a wrapper we own can enforce the rule.

## Decision

Curated façades (`Players`, `Worlds`, `Items`, `Sender`) are the documented API and carry their capability in `R`. Raw Bukkit access remains possible, compiles, and runs, but is documented as the exception: it is invisible to the thread checker.

## Consequences

- The typed-thread story holds only for code that uses façades. The docs must say so plainly rather than implying the type system covers all Java calls.
- The façade surface is a permanent maintenance obligation against Paper version churn. It must stay small and grow only when a pattern needs it.
- Rejected: façades-only (re-exporting the Bukkit API is an unwinnable treadmill) and runtime-assert-only (discards the differentiator).
- Any doc example that calls raw Bukkit to mutate the world is now a bug, except where it is deliberately illustrating the escape hatch.
