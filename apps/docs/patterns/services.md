---
title: Services and Layers
description: WarpService as an Effect Layer.
---

# Services and Layers

These are Effect v4 tags and Layers. Soft dependencies add requirements to `R`, and each one's `X.layer()` satisfies it.

```typescript
import { Context, Effect, Layer, Option, Ref, Schema } from "effect"

class WarpNotFound extends Schema.TaggedError<WarpNotFound>()(
  "WarpNotFound",
  { name: Schema.String },
) {}

export class WarpService extends Context.Service<WarpService>()(
  "@homes/WarpService",
  {
    make: Effect.gen(function* () {
      const store = yield* Ref.make(new Map<string, Location>())
      return {
        set: (name: string, loc: Location) =>
          Ref.update(store, (m) => new Map(m).set(name, loc.clone())),
        get: (name: string) =>
          Ref.get(store).pipe(
            Effect.flatMap((m) =>
              Option.match(Option.fromNullable(m.get(name)), {
                onNone: () => Effect.fail(new WarpNotFound({ name })),
                onSome: Effect.succeed,
              }),
            ),
          ),
        list: Ref.get(store).pipe(Effect.map((m) => [...m.keys()])),
        del: (name: string) =>
          Ref.update(store, (m) => {
            const next = new Map(m)
            next.delete(name)
            return next
          }),
      }
    }),
  },
) {}

export const WarpLive = Layer.effect(WarpService, WarpService.make)
```

In tests, provide a different Layer for `WarpService` (for example, one pre-seeded with warps) without touching the commands.
