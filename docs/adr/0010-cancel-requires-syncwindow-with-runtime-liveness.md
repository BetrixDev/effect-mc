# ADR-0010: `cancel` requires `SyncWindow`, with runtime liveness behind it

- **Status:** Accepted (2026-11-04)

## Context

Research measured that `Effect.forkChild(Effect.void)` inside `runSyncExit` returns `Success`, while `sleep`, a promise-backed effect, and `never` all return `Die(AsyncFiberError)`. So "a fork ends the sync window" — as `design/threading.md` states — is false.

Worse, a forked fiber inherits its parent's context, so it still has `SyncWindow` in its environment and **still typechecks** `event.cancel` after the Java listener has already returned. Types alone cannot close that hole.

## Decision

`cancel` remains an `Effect` requiring `SyncWindow`. The event handle also tracks whether its dispatch is still open, and a `cancel` after the listener returned throws `AsyncInCancellableHandler`.

## Consequences

- The compile-time guarantee survives: async-event code cannot cancel, because it has no `SyncWindow`.
- Forking is the one leak the type system cannot catch, and the runtime catches it instead. The docs must say so explicitly rather than claiming forks end the window.
- A handler that forks a cancel path fails at runtime, not at build time. That is a real gap between the promise and the enforcement, and the error must name the fork as the likely cause.
- `AsyncInCancellableHandler` becomes a public error the boundary can render, not an internal assertion.
