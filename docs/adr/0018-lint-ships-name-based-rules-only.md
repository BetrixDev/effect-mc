# ADR-0018: Lint ships name-based rules only

- **Status:** Accepted (2026-11-04)

## Context

The intent was that oxlint's type-aware linting could catch thread violations — a world call inside an async handler. Research: oxlint does have type-aware rules (`oxlint-tsgolint`, `typescript/*`, `--type-aware`, requiring TypeScript 7), but **custom JS plugin rules receive no type information**. The docs list type-awareness as explicitly unsupported for plugins.

So a custom rule can see that `setTimeout` is referenced; it cannot see that a value is a `Player`.

## Decision

The lint package ships name-based rules only:

- `setTimeout`, `setInterval`, `setImmediate`
- `require`, dynamic `import()`
- top-level `await`
- `Promise` construction and `.then` chains
- `import.meta.url`

Thread violations stay enforced by runtime dev asserts.

## Consequences

- Lint catches what is statically catchable and stops there. It must not claim to enforce the threading model.
- The thread story rests on the type system (`Main` in `R`) plus runtime asserts, with no third mechanism. That is one fewer place for the guarantee to disagree with itself.
- Some banned names — `setTimeout`, `require` — do not exist in a polyglot Graal context at all. The rules exist for early, readable feedback rather than because the runtime would otherwise succeed.
- A type-aware thread checker remains possible later as a separate compiler-API pass. It is not part of v0, and the lint package must not be shaped as if it were.
