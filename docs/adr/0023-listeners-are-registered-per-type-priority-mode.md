# ADR-0023: Listeners are registered per type, priority and mode

- **Status:** Accepted (2026-11-04)

## Context

`events.md` promises one Java listener per event type. But `priority` and `ignoreCancelled` are properties of a `RegisteredListener`, not of the event type. One listener per type therefore forces a single priority for the entire host on that event, shared by every plugin that attaches to it — silently overriding each plugin's requested priority.

ADR-0012 already requires a per-attach mode.

## Decision

The host registers one Java listener per **(event type × priority × mode)** combination, and fans each dispatch out to that combination's attached handlers.

## Consequences

- Per-attach `priority` and `ignoreCancelled` are honored, and Java/TS interleaving respects the same ordering rules as purely Java plugins.
- The number of `RegisteredListener`s is bounded by distinct combinations actually used, not by attach count.
- Fan-out now happens at a finer grain, so a stream's identity must include its priority and mode. Two attaches of the same type with different priorities are different streams.
- The "one Java listener per event type" sentence in `events.md` becomes false and must be rewritten.
