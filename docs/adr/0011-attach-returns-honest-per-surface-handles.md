# ADR-0011: Attach returns honest, per-surface handles

- **Status:** Accepted (2026-11-04). Amends ADR-0002.

## Context

ADR-0002 said every attach returns a handle you can detach. Research found that `Commands.register` returns `@Unmodifiable Set<String>` of root labels and that `Commons extends Registrar` where `Registrar` is an empty marker — **there is no command unregister API at all**. Events and scheduled tasks, by contrast, can be removed (`HandlerList` and the scheduler's task handles).

## Decision

Handles follow what each surface can actually do:

- `Events.attach(...)` returns a detachable handle.
- `Tasks.attach(...)` returns a detachable handle.
- `Commands.attach(...)` returns `void`. Re-registration happens on `Cause.RELOAD`.

## Consequences

- No unified `Handle` type. The asymmetry is the platform's, and hiding it behind a `detach` that throws would be worse than surfacing it.
- ADR-0002's sentence about returning a handle applies to events and tasks only.
- Dynamic permission changes do not need command unregistration: `requires` is re-evaluated per dispatch, and `updateCommands` resyncs clients.
- Any doc claiming commands are unregistered during teardown is wrong and must be rewritten around re-registration.
