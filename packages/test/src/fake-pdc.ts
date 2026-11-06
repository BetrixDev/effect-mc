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
 * core `Pdc` façade that will sit above it.
 */
export interface FakePdc {
  readonly set: (key: FakePdcKey, value: unknown) => void;
  readonly get: (key: FakePdcKey) => unknown;
  readonly has: (key: FakePdcKey) => boolean;
  readonly remove: (key: FakePdcKey) => void;
  readonly keys: () => ReadonlyArray<FakePdcKey>;
  readonly clear: () => void;
}

const keyId = ({ namespace, key }: FakePdcKey): string => `${namespace}\u0000${key}`;

export const makeFakePdc = (): FakePdc => {
  const values = new Map<string, { readonly key: FakePdcKey; readonly value: unknown }>();

  return {
    set: (key, value) => {
      values.set(keyId(key), { key: { namespace: key.namespace, key: key.key }, value });
    },
    get: (key) => values.get(keyId(key))?.value,
    has: (key) => values.has(keyId(key)),
    remove: (key) => {
      values.delete(keyId(key));
    },
    keys: () => Array.from(values.values(), (entry) => ({ ...entry.key })),
    clear: () => {
      values.clear();
    },
  };
};
