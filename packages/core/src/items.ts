import type { ItemStack } from "@effectmc/paper-types";
import { Effect } from "effect";
import { makePdcHandle, PdcPlatform, type PdcHandle } from "./pdc";
import { Main } from "./threads";

/**
 * The item façade. `ItemStack` is not a `PersistentDataHolder`, so its PDC
 * path is a scoped consumer rather than a second `Pdc.set` overload
 * (ADR-0014). The typed handle is only valid for the duration of the consumer.
 */
export const Items = {
  /**
   * Edits an item's persistent data through a scoped handle. The consumer runs
   * on `Main`, and the handle is closed as soon as it returns. A handle call
   * after that throws `PdcHandleClosed`; a corrupted value read through the
   * handle throws `PdcDecodeError`.
   */
  editPdc: <A>(stack: ItemStack, edit: (pdc: PdcHandle) => A): Effect.Effect<A, never, Main> =>
    Effect.gen(function* () {
      yield* Main;
      const platform = yield* PdcPlatform;

      return yield* Effect.sync(() => {
        let edited = false;
        let result!: A;

        stack.editPersistentDataContainer((container) => {
          const { handle, close } = makePdcHandle(container, platform);
          try {
            result = edit(handle);
            edited = true;
          } finally {
            close();
          }
        });

        if (!edited) {
          throw new Error(
            "ItemStack.editPersistentDataContainer did not invoke the consumer; this item has no editable data container.",
          );
        }

        return result;
      });
    }),
};
