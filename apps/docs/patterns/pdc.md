---
title: PersistentDataContainer
description: Schema-typed persistent data.
---

# PersistentDataContainer

Declare a namespace of Schema keys once. Then get and set values as Effects on any `PersistentDataHolder`, on the holder's thread.

```typescript
export const Keys = Pdc.namespace("homes", {
  owner: Schema.UUID,
  home: Home,
})

yield* Paper.on(player, Pdc.set(player, Keys.owner, id))
yield* Items.editPdc(stack, (pdc) => pdc.set(Keys.owner, id))
```

- `Pdc.get` returns `Option<A>`. A tag that fails to decode surfaces as `PdcDecodeError` (see [errors](/patterns/errors)).
- Struct schemas such as `Home` are stored as a nested `TAG_CONTAINER`.
- `Pdc.set` / `Pdc.get` require `Main`, so wrap them in `Paper.on(holder, …)`.
