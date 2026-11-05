# ADR-0014: `Pdc` requires `Main` as a safety choice, and items get a scoped handle

- **Status:** Accepted (2026-11-04)

## Context

`patterns/pdc.md` says `Pdc.set` / `Pdc.get` require `Main` "on the holder's thread". Research found no documented thread restriction on PDC anywhere, and the implementation is an unsynchronized `HashMap` with no thread check. The real constraint is region ownership of the holder.

Separately, `ItemStack` is **not** a `PersistentDataHolder`. It exposes a read-only view, with mutation going through `editPersistentDataContainer` or `getItemMeta` → mutate → `setItemMeta`.

## Decision

- PDC operations require `Main`. Documented as an EffectMC safety choice, explicitly not a Paper rule.
- Items use a distinct entry point, `Items.editPdc(stack, (pdc) => ...)`, where the handle is valid only inside the consumer.

## Consequences

- Off-thread reads of a detached holder are blocked even though Paper would allow them. That is over-strict by design and must be stated as such, or it will read as a bug.
- The item path cannot reuse the `PersistentDataHolder` signature, which is why `Items.editPdc` exists rather than a second overload of `Pdc.set`.
- `Pdc.set` / `Pdc.get` over a holder are only offered for types that genuinely implement `PersistentDataHolder`; `Location` and `Block` are not among them, and `Block` is reached via `getState()`.
