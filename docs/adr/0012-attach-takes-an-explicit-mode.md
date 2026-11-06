# ADR-0012: `attach` takes an explicit sync or async mode

- **Status:** Accepted (2026-11-04)

## Context

`AsyncChatEvent`'s javadoc says it "will sometimes fire synchronously". Any capability derived from the event _class_ is therefore unsound: a handler typed for `AsyncThread` may be running on the main thread, and a handler typed for `Main` may be running off it.

## Decision

`Events.attach` takes an explicit mode:

```typescript
Events.attach(AsyncChatEvent, { mode: "sync" }, handler); // Main + SyncWindow
Events.attach(AsyncChatEvent, { mode: "async" }, handler); // AsyncThread, no cancel
```

A dispatch with no attachment declared for its actual `isAsynchronous()` throws in dev builds. When both modes are attached, the matching attachment runs and the other is skipped.

## Consequences

- The two branches have different capabilities and different cancel availability, so the author states which one they are writing.
- A plugin that genuinely needs both branches attaches twice. That is two listeners on the same event type, which the listener registry already supports. Each dispatch goes to the attachment whose declared mode matches the event's `isAsynchronous()`; the other is skipped.
- A dispatch with no attachment declared for its actual mode throws `EventThreadingMismatch` in development. When both modes are attached, a dispatch always has a matching branch and does not fail.
- An event that changes its threading behaviour in a future Paper release fails loudly instead of silently moving a handler to the wrong thread.
- The default cannot be inferred, so there is no shorthand that quietly picks one.
