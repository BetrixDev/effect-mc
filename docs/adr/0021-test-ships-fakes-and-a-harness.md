# ADR-0021: `@effectmc/test` ships fakes plus a harness

- **Status:** Accepted (2026-11-04)

## Context

`design/roadmap.md` puts the test package alongside core and calls it the seam that lets plugin logic run without a server. ADR-0002's finite program makes a harness possible: the program can be run to completion before anything is asserted.

## Decision

v0 ships mock Layers (sender, events, PDC, scheduler/clock, registry) **and** a harness that runs a program and inspects the Registry. No headless Paper server.

## Consequences

- The harness is what makes "teardown leaves the Registry empty" a testable claim rather than a hope. That is the cheapest place to catch reload leaks before the 50× spike.
- Fake Layers without a harness would have left authors to reinvent the runtime wiring, which is the part most likely to diverge from production.
- No headless Paper means no test can prove that Paper's real dispatch matches the fake. That gap is covered by the sample plugin and the spikes, not by unit tests.
- The harness depends on the program being finite; a program that blocks will hang a test. The harness should time out and say why.
