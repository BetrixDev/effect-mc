---
title: UI (deferred)
description: The deferred @effectmc/ui design.
---

# UI (deferred)

> **Deferred past v0.** `@effectmc/ui` is still planned, but it's off the v0 critical path.

## Planned shape

- Our own TEA (The Elm Architecture) implementation, not Foldkit.
- An `InventoryBuilder`.
- InvUI-style separation of GUI and Window.
- Deny all clicks by default.
- Open and close on the next tick.
- A custom `InventoryHolder`.
- Cursor cleanup.
- One Model per viewer.

## Behavior

- Click handlers run synchronously, like event handlers inside `SyncWindow`: cancel before returning.
- Diff against the last rendered state, because the client can diverge.
- The Registry tears the UI down on quit, kick, world change, and reload.
