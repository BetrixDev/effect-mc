---
title: Errors
description: Tagged errors at command and interact boundaries.
---

# Errors

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

Use tagged errors, with an Adventure renderer at command and interact boundaries.

```typescript
class PdcDecodeError extends Schema.TaggedError<PdcDecodeError>()(
  "PdcDecodeError",
  { key: Schema.String, detail: Schema.String },
) {}
```

Catch errors by tag at the boundary:

```typescript
const handler = program.pipe(
  Effect.catchTag("PdcDecodeError", (e) =>
    Sender.failMessage(`Corrupt data for ${e.key}`),
  ),
)
```

Other core tags include `PermissionDenied`, `ThreadBoundaryError` (dev-mode runtime assert), and `SqlError` from `@effect/sql`.
