# ADR-0002: Registration uses attach verbs, and the program is finite

- **Status:** Accepted (2026-11-03)

## Context

The docs had no registration model at all. `design/events.md` and `patterns/events.md` showed `Events.of(BlockBreakEvent).pipe(Stream.runForEach(handler))`, which is an `Effect` that never returns, and `patterns/bootstrap.md:16` did `yield* axeBoltLive` — yielding that effect inside the program, which would block forever and install nothing.

Three shapes were on the table: the program blocks on purpose and *is* the running plugin; the program declares through attach verbs and completes; or a fully declarative record with no program body.

## Decision

The program installs registrations and completes immediately:

```typescript
export default Plugin("demo", Layer, Effect.gen(function* () {
  yield* Events.attach(BlockBreakEvent, handler)
  yield* Commands.attach(WarpRoot)
  yield* Tasks.every("1m", sweep)
}))
```

Each attach forks scoped, returns a handle, and lands in the Registry.

Rejected: the blocking-program form, because it turns every plugin into a concurrency-combinator puzzle (`Effect.all`, `Stream.merge`) and makes a two-line plugin ugly. Rejected: the declarative record, because it cannot express "compute this value, then register based on it" — which is the reason the framework exists.

## Consequences

- A plugin whose program must read a config, resolve a service, and only then attach is written as ordinary `Effect.gen` code.
- `@effectmc/test` can run the program to completion and then assert the Registry's contents, including that teardown leaves it empty.
- A long-lived effect inside the program is a bug the type system cannot catch; the docs must state the rule, and the dev build should warn when the program does not complete.
- `Events.of(...).pipe(Stream.runForEach(...))` is no longer the documented path. The patterns pages need rewriting around `Events.attach`.
