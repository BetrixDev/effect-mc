# ADR-0022: v0 has no config surface

- **Status:** Accepted (2026-11-04)

## Context

Nothing in the docs mentions configuration, yet every real plugin needs it. The two shapes available were a Schema-typed `config.yml` provided as a Layer, or JSON through the Pdc codecs.

## Decision

v0 has none. Authors read a file from their container directory with ordinary code. The gap is documented rather than left implicit.

## Consequences

- Scope stays on the hot path: plugin entry, events, commands, PDC, reload.
- The first thing every real plugin will hand-roll is config loading, which is a strong signal that config is the first post-v0 addition.
- A Schema-typed config Layer is the obvious eventual shape, and nothing here blocks it — reading raw now does not fix a format.
- The quickstart must show the raw read, or readers will assume configuration is impossible.
