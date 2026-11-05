# ADR-0008: `Events.of` returns a plain Stream

- **Status:** Accepted (2026-11-03)

## Context

`design/events.md` and `patterns/index.md` both say `Events.of(Type)` returns an "EventStream", and describe keyed fan-out (`player.events.chat`) as having "the same `EventStream` shape". The docs never say whether that is a nominal type or informal shorthand.

A nominal type would carry event metadata and the cancel capability, but every Stream combinator (`filter`, `map`, `merge`, `debounce`) would need re-exporting or bridging to keep it usable.

## Decision

`Events.of(Type)` returns `Stream<EventHandle<T>>`. `EventHandle<T>` is the wrapped element: a snapshot of the Bukkit event whose `cancel` requires `SyncWindow` in `R`. There is no nominal `EventStream` type.

## Consequences

- Every `Stream` combinator works without a bridge, including the buffering and debouncing operators that deliberately close the cancel window.
- The type name `EventStream` disappears from the docs; `Stream<EventHandle<T>>` and "event stream" (informal, lowercase) replace it.
- Cancellation is expressed as a requirement on the element's method rather than on the stream's type. That is the same information, attached one level down, and it survives `Stream.filter` without any wrapper.
- `player.events.chat` and `Events.of(AsyncChatEvent)` yield the same element type, so the keyed helpers genuinely are sugar.
