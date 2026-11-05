---
title: Bootstrap
description: The declarative plugin entry.
---

# Bootstrap

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

The plugin entry is declarative: a name, Layers, and a program. The program registers everything through the host Registry, so reload teardown stays mechanical.

```typescript
import { Effect } from "effect"
import { EffectMC, Layer } from "@effectmc/core"
import { axeBoltLive } from "./axe-bolt"

EffectMC.Plugin("demo", Layer.empty, Effect.gen(function* () {
  yield* axeBoltLive
}))
```
