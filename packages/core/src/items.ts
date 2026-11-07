import type { ItemStack, PersistentDataContainer } from "@effectmc/paper-types";
import type { Effect } from "effect";
import { inMain } from "./facade";
import type { Main } from "./threads";

/**
 * The item façade. `ItemStack` is not a `PersistentDataHolder`, so its PDC
 * path is a scoped consumer rather than a second `Pdc.set` overload
 * (ADR-0014). The handle is only valid for the duration of the consumer.
 */
export const Items = {
  /**
   * Edits an item's persistent data through a scoped container. The consumer
   * runs on `Main`, and the container must not escape it.
   */
  editPdc: <A>(
    stack: ItemStack,
    edit: (pdc: PersistentDataContainer) => A,
  ): Effect.Effect<A, never, Main> =>
    inMain(() => {
      let edited = false;
      let result!: A;

      stack.editPersistentDataContainer((pdc) => {
        result = edit(pdc);
        edited = true;
      });

      if (!edited) {
        throw new Error(
          "ItemStack.editPersistentDataContainer did not invoke the consumer; this item has no editable data container.",
        );
      }

      return result;
    }),
};
