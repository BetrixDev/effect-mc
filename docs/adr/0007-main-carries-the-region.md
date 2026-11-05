# ADR-0007: `Main` carries the region from day one

- **Status:** Accepted (2026-11-03)

## Context

`design/threading.md:35` sketched `Main` with an optional region payload (`{ readonly region?: Entity | Location }`) and then described it as "simplified". On Paper the payload is always absent; under Folia it names the entity or location that owns the region.

The alternative was a bare `void` tag in v0, adding the payload when Folia arrives.

## Decision

`Main` carries the payload in v0:

```typescript
class Main extends Context.Tag("Main")<Main, { readonly region?: Entity | Location }>() {}
```

## Consequences

- Adding a payload to a tag after release is a breaking change to every signature that mentions `Main` — including every façade method and every hop helper. Paying for it once now is cheaper than every downstream plugin paying later.
- v0 code must carry a payload it never reads. That is dead weight in the type channel, and the docs owe an explanation for why it is there.
- This is the one decision that actively bets on Folia. If Folia is dropped entirely, the payload is deletable, which is the one direction that direction is cheap to reverse.
