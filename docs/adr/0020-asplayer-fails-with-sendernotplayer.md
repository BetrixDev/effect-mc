# ADR-0020: `Sender.asPlayer` fails with `SenderNotPlayer`

- **Status:** Accepted (2026-11-04)

## Context

`Sender.asPlayer` appears in `patterns/commands.md` and `patterns/warps.md` with no stated failure mode. Reusing `PermissionDenied` would conflate "you lack permission" with "the console cannot teleport" — different causes with different fixes.

## Decision

`asPlayer` fails with a tagged `SenderNotPlayer` error carrying the sender's name.

## Consequences

- The default Renderer maps it to a player-only message, so authors get correct behaviour without writing a `catchTag`.
- Permission failures stay distinguishable in logs and in rendered output.
- Every player-only command still needs the failure in its error channel unless the boundary catches it first. It does.
