/**
 * @effectmc/core
 *
 * The plugin entry point, runtime, Registry, event surface, and observability
 * seam.
 */
export { isPlugin, Plugin, type RuntimeServices } from "./plugin";
export {
  Events,
  type EventAttachOptions,
  type EventAttachment,
  type EventCancel,
  type EventHandle,
  type EventHandler,
  type EventStreamOptions,
} from "./events";
export {
  EventBus,
  eventPriorities,
  type CancellableEvent,
  type EventBusService,
  type EventClass,
  type EventListener,
  type EventListenerRegistration,
  type EventMode,
  type EventPriority,
} from "./event-bus";
export { SyncWindow } from "./sync-window";
export {
  Registry,
  type Registration,
  type RegistrationKind,
  type RegistryService,
} from "./registry";
export { Observability, type ObservabilityLevel, type ObservabilityService } from "./observability";
export { AsyncInCancellableHandler, RuntimeStateError, type RuntimeState } from "./errors";
export { PluginRuntime, type PluginRuntimeOptions } from "./runtime";
