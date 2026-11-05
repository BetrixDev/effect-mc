# ADR-0015: One host jar; loose bundles in dev, packed jars in dist

- **Status:** Accepted (2026-11-04). Supersedes the "jar always" reading of earlier rounds.

## Context

Paper loads `.jar` files placed directly in `plugins/`, holds them open, and has no unload API. So a jar that Paper loads can never be replaced while the server runs — which kills any fast save→reload loop on Windows, where an open file cannot be rewritten.

That single constraint resolves the artifact question. Paper reads `plugins/` non-recursively.

## Decision

- `effectmc-host.jar` is the only Paper plugin, installed once.
- Author plugins are **containers** under `plugins/EffectMC/<name>/`, which Paper never scans.
- In dev, a container is a loose directory: `plugin.json` + `plugin.mjs`.
- For distribution, `effectmc build` packs the same two files into `<name>.jar` under that directory.

## Consequences

- Save→reload never touches a file Paper holds, so the loop is a file write plus a Context rebuild.
- Distribution still yields a jar, which is what admins expect, without ever making it a Paper plugin.
- The host owns container discovery and validation, including shape errors and version incompatibility, because Paper validates nothing here.
- Two container shapes to test. The host must treat a directory and a jar through one interface, or the dev and dist paths will diverge.
