---
title: Errors
description: Tagged errors at command and interact boundaries.
---

# Errors

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
