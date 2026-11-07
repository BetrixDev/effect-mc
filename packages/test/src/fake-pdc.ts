import type { PdcPlatformService } from "@effectmc/core";

/**
 * A structural stand-in for Paper's `NamespacedKey`. The real key is a Java
 * object; the fake only needs its two string parts so tests can compare keys
 * by value.
 */
export interface FakePdcKey {
  readonly namespace: string;
  readonly key: string;
}

/**
 * An in-memory persistent data container. It stores raw values, exactly as a
 * `PersistentDataContainer` does; Schema encoding and decoding belong to the
 * core `Pdc` façade that sits above it.
 *
 * `set` accepts both the convenience `(key, value)` form and Paper's
 * `(key, type, value)` form, because the real `Pdc` always passes the type.
 */
export interface FakePdc {
  readonly set: {
    (key: FakePdcKey, value: unknown): void;
    (key: FakePdcKey, type: unknown, value: unknown): void;
  };
  readonly get: {
    (key: FakePdcKey): unknown;
    (key: FakePdcKey, type: unknown): unknown;
  };
  readonly has: {
    (key: FakePdcKey): boolean;
    (key: FakePdcKey, type: unknown): boolean;
  };
  readonly remove: (key: FakePdcKey) => void;
  readonly keys: () => ReadonlyArray<FakePdcKey>;
  readonly clear: () => void;
  readonly getAdapterContext: () => {
    readonly newPersistentDataContainer: () => FakePdc;
  };
}

const keyId = ({ namespace, key }: FakePdcKey): string => `${namespace}\u0000${key}`;

export const makeFakePdc = (): FakePdc => {
  const values = new Map<string, { readonly key: FakePdcKey; readonly value: unknown }>();

  const set: FakePdc["set"] = (key, second, third?) => {
    // Paper's signature is (key, type, value); the two-argument form is a
    // convenience for tests that do not care which type was chosen.
    const value = third === undefined ? second : third;
    values.set(keyId(key), { key: { namespace: key.namespace, key: key.key }, value });
  };

  const get: FakePdc["get"] = (key, _type?) => values.get(keyId(key))?.value;

  const has: FakePdc["has"] = (key, _type?) => values.has(keyId(key));

  return {
    set,
    get,
    has,
    remove: (key) => {
      values.delete(keyId(key));
    },
    keys: () => Array.from(values.values(), (entry) => ({ ...entry.key })),
    clear: () => {
      values.clear();
    },
    getAdapterContext: () => ({
      newPersistentDataContainer: () => makeFakePdc(),
    }),
  };
};

/**
 * The PDC platform a harness provides. Keys stay structural and data types are
 * markers: `makeFakePdc` stores raw values, so it never inspects either.
 */
export const makeFakePdcPlatform = (): PdcPlatformService =>
  ({
    namespacedKey: (namespace: string, key: string) => ({ namespace, key }),
    dataType: (kind: string) => ({ kind }),
  }) as unknown as PdcPlatformService;
