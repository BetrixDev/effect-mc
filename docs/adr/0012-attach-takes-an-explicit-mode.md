# ADR-0012: `attach` takes an explicit sync or async mode

- **Status:** Accepted (2026-11-04)

## Context

`AsyncChatEvent`'s javadoc says it "will sometimes fire synchronously". Any capability derived from the event *class* is therefore unsound: a handler typed for `AsyncThread` may be running on the main thread, and a handler typed for `Main` may be running off it.

## Decision

`Events.attach` takes an explicit mode:

```typescript
Events.attach(AsyncChatEvent, { mode: "sync" }, handler)   // Main + SyncWindow
Events.attach(AsyncChatEvent, { mode: "async" }, handler)  // AsyncThread, no cancel
```

A dispatch whose actual `isAsynchronous()` does not match the declared mode throws in dev builds.

## Consequences

- The two branches have different capabilities and different cancel availability, so the author states which one they are writing.
- A plugin that genuinely needs both branches attaches twice. That is two listeners on the same event type, which the listener registry already supports.
- An event that changes its threading behaviour in a future Paper release fails loudly instead of silently moving a handler to the wrong thread.
- The default cannot be inferred, so there is no shorthand that quietly picks one.
