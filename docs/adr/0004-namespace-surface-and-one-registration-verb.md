# ADR-0004: One namespace per concept, one registration verb

- **Status:** Accepted (2026-11-03)

## Context

The docs mixed styles: `Paper.offload` and `Pdc.set` sat next to bare `Main` and `EventStream`. Separately, `design/events.md:43` offered `Events.run` as "sugar only, with the same semantics as `Events.of` + `Stream.runForEach`".

Under ADR-0002, `Stream.runForEach` is no longer the registration path, so the sugar describes a shape that no longer exists — and `of` / `run` / `attach` would be three names for one job.

## Decision

Namespaces carve the surface by concept: `Paper.`, `Events.`, `Pdc.`, `Players.`, and so on. Tags are bare imports: `Main`, `AsyncThread`, `SyncWindow`.

`Events.attach` is the only registration verb. `Events.run` is deleted. `Events.of` survives only as the read path that returns a stream, not as a way to register.

## Consequences

- `Events.of(Type)` and `Events.attach(Type, handler)` are distinct because reading and registering are distinct. The doc must state the difference in one line.
- Deleting `Events.run` removes a documented public API before it ever shipped, which is the cheapest possible time to remove it.
- Namespace objects keep tags and operations visually separable at the import site, and match the style of the Effect APIs authors already read.
