import { makeRegistry, type Registration, type RegistryService } from "@effectmc/core";

/**
 * An inspectable Registry. `leaked` records the entries that were still
 * present when `clear` ran, which is how the harness turns "teardown emptied
 * the Registry" into a claim that can fail (ADR-0021).
 */
export interface FakeRegistry extends RegistryService {
  readonly leaked: () => ReadonlyArray<Registration>;
}

export const makeFakeRegistry = (): FakeRegistry => {
  const registry = makeRegistry();
  const leaked: Array<Registration> = [];

  return {
    add: registry.add,
    entries: registry.entries,
    clear: () => {
      leaked.push(...registry.entries());
      registry.clear();
    },
    leaked: () => leaked.slice(),
  };
};
