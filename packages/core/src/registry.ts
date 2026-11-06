import { Context, Layer } from "effect";

/**
 * The surfaces that can attach something for a plugin's lifetime. Commands are
 * recorded for inspection even though the platform provides no way to
 * unregister them (ADR-0011).
 */
export type RegistrationKind = "command" | "event" | "gui" | "permission" | "task";

/**
 * One entry in the Registry. The Registry records what a plugin attached; it
 * does not own the attachment itself, which is scoped to the runtime.
 */
export interface Registration {
  readonly kind: RegistrationKind;
  readonly name?: string;
}

export interface RegistryService {
  /** Records an attachment and returns the same entry for convenience. */
  readonly add: (registration: Registration) => Registration;
  /** Removes an entry by identity. Detaching is the caller's job. */
  readonly remove: (registration: Registration) => void;
  readonly entries: () => ReadonlyArray<Registration>;
  /** Empties the Registry. Teardown calls this after the runtime scope closes. */
  readonly clear: () => void;
}

/**
 * The host-side record of everything a plugin attached (ADR-0002). The runtime
 * provides it to the program and exposes the same instance for teardown
 * assertions.
 */
export class Registry extends Context.Service<Registry, RegistryService>()("effectmc/Registry") {}

export const makeRegistry = (): RegistryService => {
  const registrations: Array<Registration> = [];

  return {
    add: (registration) => {
      registrations.push(registration);
      return registration;
    },
    remove: (registration) => {
      const index = registrations.indexOf(registration);
      if (index >= 0) {
        registrations.splice(index, 1);
      }
    },
    entries: () => registrations.slice(),
    clear: () => {
      registrations.length = 0;
    },
  };
};

export const registryLayer = (registry: RegistryService): Layer.Layer<Registry> =>
  Layer.succeed(Registry, registry);
