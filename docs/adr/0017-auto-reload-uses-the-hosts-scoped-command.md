# ADR-0017: Auto-reload sends the host's own scoped reload command

- **Status:** Accepted (2026-11-04)

## Context

After a successful build, the dev loop needs the server to pick up new code. Paper's `/reload` re-enables every plugin, which leaks and is widely discouraged. Restarting the managed server is always correct but slow. A scoped command exists only if the host provides one.

## Decision

The tool sends `/effectmc reload <name>` over RCON. The host re-reads that plugin's container and rebuilds its Context.

This is a **Context rebuild, not module-level hot reload**. The caveated-reload contract stands: dispose runtime, empty the Registry, close the Context, open a new one, re-run the program.

## Consequences

- The dev loop exercises the same teardown path that ships, so reload bugs surface during development instead of in production.
- Reload is per-plugin, so an unrelated plugin's state survives. That requires the host to keep per-plugin isolation honest.
- RCON must be enabled in the managed server's config; when the author uses `--server`, it may not be. The tool must fail with an instruction rather than a timeout.
- Module-level HMR stays unavailable. Every save pays a full Context rebuild, and that cost is the floor on the loop's speed.
