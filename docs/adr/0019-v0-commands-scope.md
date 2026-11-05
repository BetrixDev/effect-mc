# ADR-0019: v0 commands are subcommands, arguments, permissions and suggestions

- **Status:** Accepted (2026-11-04)

## Context

`design/commands.md` imports `Flag` and never shows one, and `threading.md` claims suggestions get `AsyncThread`. Research: `SuggestionProvider` is invoked synchronously on the dispatch thread, and Paper's own docs describe the async branch as the one where most of its API is unusable.

## Decision

v0 ships `Command.make`, `withSubcommands`, `Argument` (required and optional), `withDescription`, and `permission`. No `Flag`. Suggestions run on the dispatch thread and therefore require `Main`.

## Consequences

- The surface matches the warps/homes sample exactly. Flags are additive later, so nothing has to be un-designed.
- Without flags, no command can express `--dry-run`-style options; those must be subcommands until flags land.
- Suggestions holding `Main` means a slow provider stalls the tick. The provider needs a documented time budget and a dev warning past it.
- `Command.permission` is ours, not effect/cli's. The rest of the shape (`Command.make(name, config, handler)`, handler `R`) matches effect/cli v4 exactly and can be borrowed with confidence.
