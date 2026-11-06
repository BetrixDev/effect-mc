import { Context } from "effect";

/**
 * The surfaces the Registry records: listeners, scheduled tasks, and open GUI
 * resources. Commands are absent because the platform cannot unregister them
 * (ADR-0011); they are re-registered on reload instead.
 */
export type RegistrationKind = "gui" | "listener" | "task";

/**
 * One entry in the Registry. The Registry records what a plugin attached; it
 * does not own the attachment itself, which is scoped to the runtime.
 */
export interface Registration {
  readonly kind: RegistrationKind;
  readonly name: string;
}

export interface RegistryService {
  /** Records an attachment. */
  readonly add: (registration: Registration) => void;
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
    },
    entries: () => registrations.slice(),
    clear: () => {
      registrations.length = 0;
    },
  };
};
