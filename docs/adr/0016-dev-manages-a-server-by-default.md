# ADR-0016: `effectmc dev` manages a Paper server by default, with a `--server` override

- **Status:** Accepted (2026-11-04)

## Context

A dev loop needs a running server. The two options are to attach to one the author maintains, or to own one. Owning it means downloading Paper (via paperclip), launching the JVM, and tailing the log — real machinery, but zero setup.

Attach-only is tempting for liability reasons, but it makes "I just want to try this" a multi-step manual task, and the audience is Effect-first developers, not server admins.

## Decision

`effectmc dev` downloads a Paper build on first run, caches it, launches it, deploys into it, and tails the log. `effectmc dev --server <dir>` points at an existing installation instead.

## Consequences

- First run downloads a server and a JDK-dependent artifact. That must be visible, cached, and interruptible, not a silent pause.
- The tool now owns a process: exit handling, port conflicts, and log tailing are its problems. A crashed server must say why.
- `--server` keeps the escape hatch for testing against a real world and a real plugin set, which is the case the managed server cannot cover.
- Two modes means two code paths through deploy and reload. The deploy step should be the shared part, with only process ownership differing.
