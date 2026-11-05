# ADR-0024: The host builds with Gradle on Java 25, pinned to Paper 26.3

- **Status:** Accepted (2026-11-04)

## Context

Ticket 02 (the host boots and evaluates a container) cannot start without three answers the spec deliberately left open: the JVM build system, the Java baseline, and which Paper version to target.

Gradle is the norm for Paper plugins and the only option with first-party plugin support in current Paper documentation. The research notes verify against `paper-api 26.3.build.230-stable` and record a Java 25 baseline for that API; GraalVM for JDK 25 is the matching runtime.

## Decision

- **Gradle**, Kotlin DSL.
- **Java 25** toolchain, enforced rather than assumed.
- **`paper-api 26.3.build.230-stable`**, pinned exactly. No `+` ranges, even though Paper's docs show one.
- **`org.graalvm.polyglot` 25.3.x**, the version the GraalJS documentation pins.

## Consequences

- Every dev machine and the CI image need JDK 25. That is a real setup cost and belongs in the quickstart.
- Pinning exactly makes a Paper upgrade a deliberate, reviewable ticket instead of silent drift. The cost is that someone must do that ticket.
- The Java 25 baseline comes from the research notes rather than from a build we have run. Ticket 02 verifies it at build and boot, and corrects this ADR if it is wrong — which is cheaper than discovering it after the host ships.
- The host jar must not shade or relocate Graal, so the build's jar task needs explicit rules rather than a permissive default.
