import { Schema } from "effect";
import { eventModes } from "./event-mode";

export const runtimeStates = ["idle", "starting", "running", "failed", "disposed"] as const;

export type RuntimeState = (typeof runtimeStates)[number];

/**
 * Raised when a plugin host is asked to start a name that is already loaded.
 * A loaded plugin is replaced through `PluginHost.reload`, never by starting a
 * second runtime under the same name.
 */
export class PluginAlreadyLoaded extends Schema.TaggedError<PluginAlreadyLoaded>()(
  "PluginAlreadyLoaded",
  {
    plugin: Schema.String,
    message: Schema.String,
  },
) {}

/**
 * Raised when a plugin host is asked to reload a name it does not own. A
 * reload rebuilds an existing Context; it never loads a plugin for the first
 * time.
 */
export class PluginNotLoaded extends Schema.TaggedError<PluginNotLoaded>()("PluginNotLoaded", {
  plugin: Schema.String,
  loaded: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

/**
 * Raised when the runtime is asked to start in a state other than `idle`.
 * Disposal is terminal: the runtime never starts again, and a restart
 * constructs a new `PluginRuntime`.
 */
export class RuntimeStateError extends Schema.TaggedError<RuntimeStateError>()(
  "RuntimeStateError",
  {
    plugin: Schema.String,
    state: Schema.Literals(runtimeStates),
    message: Schema.String,
  },
) {}

/**
 * Raised by `EventHandle.cancel` when the synchronous dispatch window has
 * already closed. The type system cannot catch a cancel reached through a fork,
 * because a forked fiber inherits `SyncWindow`; this error is the runtime
 * backstop for that one hole (ADR-0010).
 */
export class AsyncInCancellableHandler extends Schema.TaggedError<AsyncInCancellableHandler>()(
  "AsyncInCancellableHandler",
  {
    event: Schema.String,
    message: Schema.String,
  },
) {}

/**
 * Raised by `Sender.asPlayer` when the current command source is the console
 * or another non-player sender. It is distinct from `PermissionDenied` because
 * "the console cannot teleport" and "you lack permission" have different fixes
 * (ADR-0020).
 */
export class SenderNotPlayer extends Schema.TaggedError<SenderNotPlayer>()("SenderNotPlayer", {
  sender: Schema.String,
  message: Schema.String,
}) {}

/**
 * Raised when a command's permission passes registration but the sender lacks
 * it at execution. It is distinct from `SenderNotPlayer`: "you lack
 * permission" and "the console cannot teleport" have different fixes
 * (ADR-0019, ADR-0020).
 */
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()("PermissionDenied", {
  permission: Schema.String,
  sender: Schema.String,
  message: Schema.String,
}) {}

/**
 * Raised when a value stored under a typed PDC key does not decode with that
 * key's Schema. Absence is `Option.none`; this error is the corruption path
 * (ADR-0014).
 */
export class PdcDecodeError extends Schema.TaggedError<PdcDecodeError>()("PdcDecodeError", {
  key: Schema.String,
  detail: Schema.String,
  message: Schema.String,
}) {}

/**
 * Raised when an `Items.editPdc` handle is used after its callback returned.
 * The container is only valid inside the scoped consumer (ADR-0014).
 */
export class PdcHandleClosed extends Schema.TaggedError<PdcHandleClosed>()("PdcHandleClosed", {
  key: Schema.String,
  message: Schema.String,
}) {}

/**
 * Raised in development when a dispatch's actual threading disagrees with the
 * mode an attachment declared. Paper can fire an event on a different thread
 * than its class suggests, so the declared mode is the authority and a
 * mismatch must be loud rather than silently moving the handler (ADR-0012).
 */
export class EventThreadingMismatch extends Schema.TaggedError<EventThreadingMismatch>()(
  "EventThreadingMismatch",
  {
    event: Schema.String,
    declared: Schema.Literals(eventModes),
    actual: Schema.Literals(eventModes),
    message: Schema.String,
  },
) {}
