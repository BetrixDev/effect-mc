---
title: Bootstrap
description: The declarative plugin entry.
---

# Bootstrap

The plugin entry is declarative: a name, Layers, and a program. The program registers everything through the host Registry, so reload teardown stays mechanical.

```typescript
import { Effect } from "effect"
import { EffectMC, Layer } from "@effectmc/core"
import { axeBoltLive } from "./axe-bolt"

EffectMC.Plugin("demo", Layer.empty, Effect.gen(function* () {
  yield* axeBoltLive
}))
```
