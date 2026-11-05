# ADR-0005: Error boundaries differ by surface

- **Status:** Accepted (2026-11-03)

## Context

Nothing in the design docs said what happens when a handler fails. `patterns/errors.md` showed an author-level `Effect.catchTag` but no framework-level policy, which leaves the default undefined: an uncaught failure either reaches the tick pump or is silently dropped.

The two boundaries carry different risks. A failing command should not take down the tick. A failing sync event handler inside a cancel window may mean a protection check failed open — silent swallowing there is worse than a crash.

## Decision

- **Commands:** catch all failures at the executor. Tagged errors render through the `Renderer` service (Adventure default); untagged defects log a stack trace. The author writes no error plumbing.
- **Sync event handlers:** tagged errors render and log. Untagged defects fail loud in dev builds and render-and-log in production.
- **Async event handlers:** render and log; the async path has no cancel window to protect.

`Renderer` is a swappable service so `@effectmc/test` can assert on rendered output.

## Consequences

- The same program behaves differently in dev and production on the sync-event path. That is intentional and must be documented, because it is the kind of divergence that surprises people at 3am.
- Rendering requires a `Sender` even in contexts where the source is not a player (console, command block); the Renderer's default must handle a non-player sender.
- A swallowed defect on the event path is a real risk in production. Mitigation is logging with the event type and handler identity, not a louder policy.
