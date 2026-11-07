import type {
  NamespacedKey,
  PersistentDataContainer,
  PersistentDataHolder,
  PersistentDataType,
} from "@effectmc/paper-types";
import { Context, Effect, Option, Result, Schema, SchemaAST } from "effect";
import { PdcDecodeError, PdcHandleClosed } from "./errors";
import { Main } from "./threads";

/**
 * Schema-typed persistent data. Reads and writes require `Main` as an EffectMC
 * safety choice, not because Paper documents a thread restriction on PDC
 * (ADR-0014).
 */

/** The PDC storage shapes a typed key maps to. */
export type PdcStorageKind = "string" | "number" | "boolean" | "container";

/**
 * The host seam behind `Pdc`. The default resolves Paper's Java classes through
 * GraalJS's `Java.type`; a non-Graal host, including the test harness, provides
 * its own implementation.
 */
export interface PdcPlatformService {
  readonly namespacedKey: (namespace: string, key: string) => NamespacedKey;
  readonly dataType: (kind: PdcStorageKind) => PersistentDataType<unknown, unknown>;
}

interface JavaBridge {
  readonly type: (name: string) => unknown;
}

const javaBridge = (): JavaBridge => {
  const bridge = (globalThis as { readonly Java?: JavaBridge }).Java;
  if (bridge === undefined) {
    throw new Error(
      "Pdc needs the GraalJS Java bridge to construct Paper's NamespacedKey and PersistentDataType values. " +
        "A host without that bridge must provide PdcPlatform.",
    );
  }
  return bridge;
};

const javaKeys = new Map<string, NamespacedKey>();
const javaTypes = new Map<PdcStorageKind, PersistentDataType<unknown, unknown>>();

const javaDataType = (kind: PdcStorageKind): PersistentDataType<unknown, unknown> => {
  const cached = javaTypes.get(kind);
  if (cached !== undefined) {
    return cached;
  }

  const types = javaBridge().type("org.bukkit.persistence.PersistentDataType") as Record<
    string,
    PersistentDataType<unknown, unknown>
  >;
  const name =
    kind === "string"
      ? "STRING"
      : kind === "number"
        ? "DOUBLE"
        : kind === "boolean"
          ? "BOOLEAN"
          : "TAG_CONTAINER";
  const dataType = types[name]!;
  javaTypes.set(kind, dataType);
  return dataType;
};

/** The Paper implementation of the {@link PdcPlatformService} seam. */
export const javaPdcPlatform: PdcPlatformService = {
  namespacedKey: (namespace, key) => {
    const id = `${namespace}\u0000${key}`;
    const cached = javaKeys.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const NamespacedKeyClass = javaBridge().type("org.bukkit.NamespacedKey") as new (
      namespace: string,
      key: string,
    ) => NamespacedKey;
    const created = new NamespacedKeyClass(namespace, key);
    javaKeys.set(id, created);
    return created;
  },
  dataType: javaDataType,
};

/**
 * The PDC platform, defaulting to the GraalJS/Paper implementation. It is a
 * `Context.Reference`, so requiring it never widens a public signature; hosts
 * override it by providing a value, exactly as the test harness does.
 */
export const PdcPlatform: Context.Reference<PdcPlatformService> = Context.Reference(
  "effectmc/PdcPlatform",
  { defaultValue: () => javaPdcPlatform },
);

/** A Schema codec that can be stored in a PDC. */
export type PdcSchema<A = unknown> = Schema.Codec<A, unknown, never, never>;

/**
 * A Schema-typed PDC key: a `NamespacedKey`'s two string parts plus the codec
 * that maps the value to a `PersistentDataType` (ADR-0009).
 */
export interface PdcKey<A> {
  readonly namespace: string;
  readonly key: string;
  readonly schema: PdcSchema<A>;
}

/** The key table `Pdc.namespace` returns. */
export type PdcNamespace<Schemas extends Record<string, PdcSchema>> = {
  readonly [K in keyof Schemas]: PdcKey<Schema.Schema.Type<Schemas[K]>>;
};

interface FieldCodec {
  readonly name: string;
  readonly codec: Codec;
}

type Codec =
  | { readonly kind: "string" | "number" | "boolean" | "json" }
  | { readonly kind: "struct"; readonly fields: ReadonlyArray<FieldCodec> };

const literalCodec = (literal: SchemaAST.LiteralValue): Codec => {
  if (typeof literal === "string") {
    return { kind: "string" };
  }
  if (typeof literal === "number") {
    return { kind: "number" };
  }
  if (typeof literal === "boolean") {
    return { kind: "boolean" };
  }
  return { kind: "json" };
};

/**
 * Maps an encoded Schema AST to the PDC shape that stores it. Structs become
 * nested containers; primitives keep their native PDC type; anything else is
 * stored as JSON in a string. The decision happens once, at declaration time.
 */
const codecFromAST = (ast: SchemaAST.AST): Codec => {
  switch (ast._tag) {
    case "String":
    case "TemplateLiteral":
      return { kind: "string" };
    case "Number":
      return { kind: "number" };
    case "Boolean":
      return { kind: "boolean" };
    case "Literal":
      return literalCodec(ast.literal);
    case "Union": {
      const kinds = new Set(ast.types.map((type) => codecFromAST(type).kind));
      if (kinds.size === 1) {
        const [kind] = kinds;
        if (kind === "string" || kind === "number" || kind === "boolean") {
          return { kind };
        }
      }
      return { kind: "json" };
    }
    case "Objects": {
      if (ast.indexSignatures.length > 0) {
        return { kind: "json" };
      }

      const fields: Array<FieldCodec> = [];
      for (const property of ast.propertySignatures) {
        if (typeof property.name !== "string") {
          return { kind: "json" };
        }
        fields.push({ name: property.name, codec: codecFromAST(property.type) });
      }
      return { kind: "struct", fields };
    }
    default:
      return { kind: "json" };
  }
};

const codecs = new WeakMap<PdcKey<unknown>, Codec>();

const codecOf = <A>(key: PdcKey<A>): Codec => {
  const codec = codecs.get(key as PdcKey<unknown>);
  if (codec === undefined) {
    throw new TypeError(
      `'${key.namespace}:${key.key}' is not a Pdc key; declare keys with Pdc.namespace.`,
    );
  }
  return codec;
};

const keyId = (key: PdcKey<unknown>): string => `${key.namespace}:${key.key}`;

/**
 * Paper's `PersistentDataHolder` redeclares `getPersistentDataContainer` with
 * the mutable `PersistentDataContainer` return type, but the generated typings
 * keep the view signature from `PersistentDataViewHolder`. The runtime value is
 * the mutable container for every holder class the API accepts.
 */
const holderContainer = (holder: PersistentDataHolder): PersistentDataContainer =>
  holder.getPersistentDataContainer() as unknown as PersistentDataContainer;

const detailOf = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { readonly message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(cause);
};

const decodeError = (key: PdcKey<unknown>, cause: unknown): PdcDecodeError => {
  const detail = detailOf(cause);
  return new PdcDecodeError({
    key: keyId(key),
    detail,
    message: `Persistent data under '${keyId(key)}' does not decode with its declared Schema: ${detail}`,
  });
};

const storageKind = (codec: Codec): PdcStorageKind =>
  codec.kind === "struct" ? "container" : codec.kind === "json" ? "string" : codec.kind;

const isContainer = (value: unknown): value is PersistentDataContainer => {
  const candidate = value as Partial<PersistentDataContainer> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.get === "function" &&
    typeof candidate.set === "function" &&
    typeof candidate.has === "function" &&
    typeof candidate.remove === "function" &&
    typeof candidate.getAdapterContext === "function"
  );
};

interface NestedContainer {
  readonly container: PersistentDataContainer;
  readonly created: boolean;
}

const getOrCreateContainer = (
  parent: PersistentDataContainer,
  platform: PdcPlatformService,
  key: NamespacedKey,
): NestedContainer => {
  try {
    const existing = parent.get(key, platform.dataType("container"));
    if (isContainer(existing)) {
      return { container: existing, created: false };
    }
  } catch {
    // A value under this key with another primitive type is corruption. A
    // write repairs it by replacing the value with a fresh container.
  }

  return {
    container: parent.getAdapterContext().newPersistentDataContainer(),
    created: true,
  };
};

const scalarValue = (
  kind: "string" | "number" | "boolean" | "json",
  encoded: unknown,
): string | number | boolean => {
  if (kind === "json") {
    const text = JSON.stringify(encoded);
    if (text === undefined) {
      throw new TypeError("Pdc cannot store a value that JSON.stringify omits.");
    }
    return text;
  }

  if (kind === "string") {
    if (typeof encoded !== "string") {
      throw new TypeError(`Pdc expected an encoded string, got ${typeof encoded}.`);
    }
    return encoded;
  }
  if (kind === "number") {
    if (typeof encoded !== "number") {
      throw new TypeError(`Pdc expected an encoded number, got ${typeof encoded}.`);
    }
    return encoded;
  }
  if (typeof encoded !== "boolean") {
    throw new TypeError(`Pdc expected an encoded boolean, got ${typeof encoded}.`);
  }
  return encoded;
};

const readRaw = (
  container: PersistentDataContainer,
  type: PersistentDataType<unknown, unknown>,
  key: NamespacedKey,
): unknown => {
  try {
    return container.get(key, type);
  } catch {
    return undefined;
  }
};

const writeStruct = (
  container: PersistentDataContainer,
  platform: PdcPlatformService,
  namespace: string,
  codec: Extract<Codec, { readonly kind: "struct" }>,
  encoded: unknown,
): boolean => {
  if (typeof encoded !== "object" || encoded === null || Array.isArray(encoded)) {
    throw new TypeError("Pdc expected a struct Schema to encode to an object.");
  }

  const record = encoded as Record<string, unknown>;
  let changed = false;

  for (const field of codec.fields) {
    const fieldKey = platform.namespacedKey(namespace, field.name);
    const value = record[field.name];

    if (value === undefined) {
      if (container.has(fieldKey)) {
        container.remove(fieldKey);
        changed = true;
      }
      continue;
    }

    if (field.codec.kind === "struct") {
      const nested = getOrCreateContainer(container, platform, fieldKey);
      const nestedChanged = writeStruct(nested.container, platform, namespace, field.codec, value);
      if (nested.created || nestedChanged) {
        container.set(fieldKey, platform.dataType("container"), nested.container);
        changed = true;
      }
      continue;
    }

    const raw = scalarValue(field.codec.kind, value);
    const type = platform.dataType(storageKind(field.codec));
    if (readRaw(container, type, fieldKey) !== raw) {
      container.set(fieldKey, type, raw);
      changed = true;
    }
  }

  return changed;
};

const writeValue = <A>(
  container: PersistentDataContainer,
  platform: PdcPlatformService,
  key: PdcKey<A>,
  value: A,
): void => {
  const codec = codecOf(key);
  const namespacedKey = platform.namespacedKey(key.namespace, key.key);
  const encoded = Schema.encodeSync(key.schema)(value);

  if (codec.kind === "struct") {
    const nested = getOrCreateContainer(container, platform, namespacedKey);
    const changed = writeStruct(nested.container, platform, key.namespace, codec, encoded);
    if (nested.created || changed) {
      container.set(namespacedKey, platform.dataType("container"), nested.container);
    }
    return;
  }

  const raw = scalarValue(codec.kind, encoded);
  const type = platform.dataType(storageKind(codec));
  if (readRaw(container, type, namespacedKey) !== raw) {
    container.set(namespacedKey, type, raw);
  }
};

const readAt = (
  container: PersistentDataContainer,
  platform: PdcPlatformService,
  key: PdcKey<unknown>,
  namespacedKey: NamespacedKey,
  codec: Codec,
): Result.Result<Option.Option<unknown>, PdcDecodeError> => {
  if (codec.kind === "struct") {
    let nested: unknown;
    try {
      nested = container.get(namespacedKey, platform.dataType("container"));
    } catch (cause) {
      return Result.fail(decodeError(key, cause));
    }

    if (nested === null || nested === undefined) {
      return Result.succeed(Option.none());
    }
    if (!isContainer(nested)) {
      return Result.fail(decodeError(key, "the stored value is not a nested container"));
    }

    const encoded: Record<string, unknown> = {};
    for (const field of codec.fields) {
      const fieldKey = platform.namespacedKey(key.namespace, field.name);
      const result = readAt(nested, platform, key, fieldKey, field.codec);
      if (Result.isFailure(result)) {
        return result;
      }
      if (Option.isSome(result.success)) {
        encoded[field.name] = result.success.value;
      }
    }
    return Result.succeed(Option.some(encoded));
  }

  let raw: unknown;
  try {
    raw = container.get(namespacedKey, platform.dataType(storageKind(codec)));
  } catch (cause) {
    return Result.fail(decodeError(key, cause));
  }

  if (raw === null || raw === undefined) {
    return Result.succeed(Option.none());
  }

  if (codec.kind === "json") {
    try {
      return Result.succeed(Option.some(JSON.parse(raw as string)));
    } catch (cause) {
      return Result.fail(decodeError(key, cause));
    }
  }

  return Result.succeed(Option.some(raw));
};

const readValue = <A>(
  container: PersistentDataContainer,
  platform: PdcPlatformService,
  key: PdcKey<A>,
): Result.Result<Option.Option<A>, PdcDecodeError> => {
  const codec = codecOf(key);
  const namespacedKey = platform.namespacedKey(key.namespace, key.key);
  const encoded = readAt(container, platform, key as PdcKey<unknown>, namespacedKey, codec);
  if (Result.isFailure(encoded)) {
    return Result.fail(encoded.failure);
  }
  if (Option.isNone(encoded.success)) {
    return Result.succeed(Option.none());
  }

  const decoded = Schema.decodeUnknownResult(key.schema)(encoded.success.value);
  if (Result.isFailure(decoded)) {
    return Result.fail(decodeError(key, decoded.failure));
  }
  return Result.succeed(Option.some(decoded.success));
};

const exists = <A>(
  container: PersistentDataContainer,
  platform: PdcPlatformService,
  key: PdcKey<A>,
): boolean => {
  const codec = codecOf(key);
  return container.has(
    platform.namespacedKey(key.namespace, key.key),
    platform.dataType(storageKind(codec)),
  );
};

/**
 * Runs a PDC operation under `Main` with the ambient platform. The platform is
 * a `Context.Reference`, so this helper is the only place its default enters.
 */
const inPdc = <A>(run: (platform: PdcPlatformService) => A): Effect.Effect<A, never, Main> =>
  Effect.gen(function* () {
    yield* Main;
    const platform = yield* PdcPlatform;
    return yield* Effect.sync(() => run(platform));
  });

/**
 * Declares a namespace of Schema-typed keys once. Every read and write through
 * those keys is typed by its Schema, both at compile time and at the PDC
 * boundary (ADR-0009).
 */
export function namespace<const Schemas extends Record<string, PdcSchema>>(
  namespace: string,
  schemas: Schemas,
): PdcNamespace<Schemas> {
  if (namespace.trim().length === 0) {
    throw new TypeError("A Pdc namespace must be a non-empty string.");
  }

  const keys: Record<string, PdcKey<unknown>> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    if (name.trim().length === 0) {
      throw new TypeError("A Pdc key name must be a non-empty string.");
    }

    const key: PdcKey<unknown> = Object.freeze({
      namespace,
      key: name,
      schema: schema as PdcSchema<unknown>,
    });
    codecs.set(key, codecFromAST(SchemaAST.toEncoded(schema.ast)));
    keys[name] = key;
  }

  return Object.freeze(keys) as unknown as PdcNamespace<Schemas>;
}

/**
 * Reads a key. Absence is `Option.none`; a value that exists but does not
 * decode is `PdcDecodeError`, so absence and corruption never blur together
 * (ADR-0014).
 */
export function get<A>(
  holder: PersistentDataHolder,
  key: PdcKey<A>,
): Effect.Effect<Option.Option<A>, PdcDecodeError, Main> {
  return inPdc((platform) => readValue(holderContainer(holder), platform, key)).pipe(
    Effect.flatMap((result) => Effect.fromResult(result)),
  );
}

/**
 * Writes a key. A struct is stored as a nested container and only fields that
 * actually changed are written, so updating one field does not rewrite the
 * rest.
 */
export function set<A>(
  holder: PersistentDataHolder,
  key: PdcKey<A>,
  value: A,
): Effect.Effect<void, never, Main> {
  return inPdc((platform) => {
    writeValue(holderContainer(holder), platform, key, value);
  });
}

/** Reports whether a value of the key's storage type is present. */
export function has<A>(
  holder: PersistentDataHolder,
  key: PdcKey<A>,
): Effect.Effect<boolean, never, Main> {
  return inPdc((platform) => exists(holderContainer(holder), platform, key));
}

/** Removes the value under the key, including a whole nested container. */
export function remove<A>(
  holder: PersistentDataHolder,
  key: PdcKey<A>,
): Effect.Effect<void, never, Main> {
  return inPdc((platform) => {
    holderContainer(holder).remove(platform.namespacedKey(key.namespace, key.key));
  });
}

/**
 * The scoped item container `Items.editPdc` hands to its consumer. The handle
 * is live only for the duration of the callback; later calls fail with
 * `PdcHandleClosed` (ADR-0014).
 */
export interface PdcHandle {
  get<A>(key: PdcKey<A>): Option.Option<A>;
  set<A>(key: PdcKey<A>, value: A): void;
  has<A>(key: PdcKey<A>): boolean;
  remove<A>(key: PdcKey<A>): void;
}

/** Creates the scoped handle and the close function `Items.editPdc` owns. */
export const makePdcHandle = (
  container: PersistentDataContainer,
  platform: PdcPlatformService,
): { readonly handle: PdcHandle; readonly close: () => void } => {
  let open = true;

  const assertOpen = (key: PdcKey<unknown>): void => {
    if (!open) {
      throw new PdcHandleClosed({
        key: keyId(key),
        message:
          `The Pdc handle is closed; '${keyId(key)}' is only valid inside the ` +
          "Items.editPdc callback that produced it.",
      });
    }
  };

  return {
    handle: {
      get: (key) => {
        assertOpen(key);
        const result = readValue(container, platform, key);
        if (Result.isFailure(result)) {
          throw result.failure;
        }
        return result.success;
      },
      set: (key, value) => {
        assertOpen(key);
        writeValue(container, platform, key, value);
      },
      has: (key) => {
        assertOpen(key);
        return exists(container, platform, key);
      },
      remove: (key) => {
        assertOpen(key);
        container.remove(platform.namespacedKey(key.namespace, key.key));
      },
    },
    close: () => {
      open = false;
    },
  };
};

/** The Schema-typed persistent data surface. */
export const Pdc = {
  namespace,
  get,
  set,
  has,
  remove,
};
