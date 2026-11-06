import { Context } from "effect";

/**
 * The unbuffered window inside a Bukkit listener dispatch. `EventHandle.cancel`
 * requires this capability, so cancellation is a compile error anywhere the
 * window is not open (ADR-0010).
 *
 * The window is a capability, not a hop. It is provided only for the duration
 * of the synchronous handler call and is absent from every other path.
 */
export class SyncWindow extends Context.Service<SyncWindow, void>()("effectmc/SyncWindow") {}
