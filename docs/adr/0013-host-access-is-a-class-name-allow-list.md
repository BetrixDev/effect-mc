# ADR-0013: Host access is a class-name allow-list predicate

- **Status:** Accepted (2026-11-04)

## Context

`design/architecture.md` says "`HostAccess` is an allow-list of Paper API packages. Never use `allowAll`." Research: `HostAccess.Builder` has no `allowType`, no `allowStaticAccess`, and no package granularity. It is member- and annotation-scoped. Paper's API classes carry no `@HostAccess.Export`, so `EXPLICIT` exposes nothing at all.

Class-name filtering lives elsewhere: `Context.Builder.allowHostClassLookup(Predicate<String>)`.

## Decision

The host builds one predicate over class names, generated from `@effectmc/paper-types` plus the curated façades, and passes it to `allowHostClassLookup`. No member filtering. No `@Export` façade mirror.

## Consequences

- Every public member of an allowed class is reachable from JS. That is the intended surface — a `Player` should expose its own API — so member filtering buys little.
- The allow-list is generated, so a Paper upgrade that adds classes does not silently expose them until the list is regenerated. That is the correct default.
- GraalVM 25.3 is sufficient; the member-filtering path (`allowPublicAccess`, `@since 25.4`) stays unused until there is a reason.
- The security boundary is "which classes exist", not "which members". Documentation must say that, because "allow-list of packages" implied a finer guarantee than is delivered.
