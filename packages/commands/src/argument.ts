import type {
  ArgumentResolver,
  BlockPosition,
  CommandSourceStack,
  Entity,
  Player,
  World,
} from "@effectmc/paper-types";
import { Main, type SenderValue } from "@effectmc/core";
import { Effect, Option } from "effect";

/**
 * The minimum a command source must expose for a Brigadier `requires`
 * predicate. Paper's `CommandSender` satisfies it structurally.
 */
export interface CommandPermissionSubject {
  readonly hasPermission: (permission: string) => boolean;
}

/**
 * The source of one command invocation. `sender` is the surface authors read
 * through `Sender`; `native` is the Paper `CommandSourceStack` that selector
 * and position arguments resolve against.
 */
export interface CommandSource {
  readonly sender: SenderValue;
  readonly native?: CommandSourceStack;
}

/**
 * One invocation handed to a registered command node or to a suggestion
 * provider. `argument` reads the value Brigadier parsed for a name.
 */
export interface CommandInvocation {
  readonly source: CommandSource;
  readonly argument: (name: string) => unknown;
}

/**
 * A suggestion request. `remaining` is the unparsed input being completed;
 * `argument` exposes arguments that were already parsed.
 */
export interface CommandSuggestion extends CommandInvocation {
  readonly remaining: string;
}

/**
 * Supplies additional suggestions for one argument. It runs on the dispatch
 * thread, so it holds `Main`; a slow provider stalls the tick (ADR-0019).
 */
export type SuggestionProvider = (
  request: CommandSuggestion,
) => Effect.Effect<ReadonlyArray<string>, never, Main>;

/** The Paper argument kinds the built-in helpers map to Brigadier. */
export type CommandArgumentKind =
  | "string"
  | "integer"
  | "boolean"
  | "player"
  | "players"
  | "entity"
  | "entities"
  | "world"
  | "blockPosition"
  | "paper";

/**
 * The platform half of an argument: which Brigadier type to build and how to
 * turn the value Brigadier produced into the author's type.
 */
export interface CommandArgumentType<T> {
  readonly kind: CommandArgumentKind;
  /**
   * The Brigadier `ArgumentType` an author supplied through `Argument.paper`.
   * The host passes it through unchanged.
   */
  readonly paper?: unknown;
  readonly read: (raw: unknown, source: CommandSource) => T;
}

interface ArgumentShape<T> {
  readonly name: string;
  readonly type: CommandArgumentType<T>;
  readonly suggest?: SuggestionProvider;
}

export type RequiredArgument<T> = ArgumentShape<T> & {
  readonly optional: false;
};

export type OptionalArgument<T> = ArgumentShape<T> & {
  readonly optional: true;
};

export type CommandArgument<T> = RequiredArgument<T> | OptionalArgument<T>;

/**
 * Any argument, regardless of its value type. Used where a tree is stored
 * heterogeneously, such as in a registered command node.
 */
export type AnyCommandArgument = CommandArgument<unknown>;

/** The values an invocation resolves for a record of declared arguments. */
export type ArgumentRecord = Readonly<Record<string, AnyCommandArgument>>;

export type ResolveArgument<A> =
  A extends OptionalArgument<infer T>
    ? Option.Option<T>
    : A extends RequiredArgument<infer T>
      ? T
      : never;

export type CommandArgs<Args extends ArgumentRecord> = {
  readonly [K in keyof Args]: ResolveArgument<Args[K]>;
};

export interface ArgumentOptions {
  readonly suggest?: SuggestionProvider;
}

export interface PaperArgumentOptions<T> {
  /**
   * The Brigadier `ArgumentType<T>`, for example `ArgumentTypes.player()`.
   * The argument layer never inspects it; the host passes it through.
   */
  readonly type: unknown;
  /** Turns the raw Brigadier value into the author's type. */
  readonly resolve: (raw: unknown, source: CommandSource) => T;
  readonly suggest?: SuggestionProvider;
}

const validateName = (name: string): string => {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("An argument name must be a non-empty string.");
  }
  return name;
};

const required = <T>(
  name: string,
  type: CommandArgumentType<T>,
  options: ArgumentOptions = {},
): RequiredArgument<T> => ({
  optional: false,
  name: validateName(name),
  type,
  suggest: options.suggest,
});

const readString =
  (name: string) =>
  (raw: unknown): string => {
    if (typeof raw !== "string") {
      throw new TypeError(`Argument '${name}' expected a string.`);
    }
    return raw;
  };

const readInteger =
  (name: string) =>
  (raw: unknown): number => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new TypeError(`Argument '${name}' expected an integer.`);
    }
    return raw;
  };

const readBoolean =
  (name: string) =>
  (raw: unknown): boolean => {
    if (typeof raw !== "boolean") {
      throw new TypeError(`Argument '${name}' expected a boolean.`);
    }
    return raw;
  };

/**
 * Selector and position arguments arrive as a Paper resolver, not as a
 * resolved value. Resolving is the part that needs the command source
 * (ADR-0019).
 */
const readResolver = <T>(name: string, raw: unknown, source: CommandSource): T => {
  if (source.native === undefined) {
    throw new TypeError(
      `Argument '${name}' needs a native command source to resolve its Paper value; no source was supplied.`,
    );
  }

  const resolver = raw as Partial<ArgumentResolver<T>> | null;
  if (resolver === null || typeof resolver.resolve !== "function") {
    throw new TypeError(`Argument '${name}' did not receive a Paper argument resolver.`);
  }

  return resolver.resolve(source.native);
};

const readSelector = <T>(name: string, raw: unknown, source: CommandSource): ReadonlyArray<T> =>
  readResolver<ReadonlyArray<T>>(name, raw, source);

const firstSelector = <T>(name: string, raw: unknown, source: CommandSource): T => {
  const values = readSelector<T>(name, raw, source);
  const first = values[0];
  if (first === undefined) {
    throw new TypeError(`Argument '${name}' matched no values.`);
  }
  return first;
};

/**
 * Resolves every declared argument into the record a handler receives.
 * Required arguments are guaranteed by Brigadier; a missing one is a defect.
 */
export const resolveArguments = (
  declarations: ReadonlyArray<AnyCommandArgument>,
  invocation: CommandInvocation,
): Readonly<Record<string, unknown>> => {
  const values: Record<string, unknown> = {};

  for (const argument of declarations) {
    const raw = invocation.argument(argument.name);

    if (argument.optional) {
      values[argument.name] =
        raw === undefined ? Option.none() : Option.some(argument.type.read(raw, invocation.source));
      continue;
    }

    if (raw === undefined) {
      throw new TypeError(`Required argument '${argument.name}' was not supplied.`);
    }
    values[argument.name] = argument.type.read(raw, invocation.source);
  }

  return values;
};

/**
 * Runs one argument's suggestion provider with `Main` supplied. The host
 * combines the result with the Paper argument type's own suggestions.
 */
export const suggestArgument = <T>(
  argument: CommandArgument<T>,
  request: CommandSuggestion,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.suspend(
    () => argument.suggest?.(request) ?? Effect.succeed<ReadonlyArray<string>>([]),
  ).pipe(Effect.provideService(Main, { region: undefined }));

/**
 * The argument author surface. Arguments are declared once in a command's
 * record and are either required or wrapped with `Argument.optional`.
 */
export const Argument = {
  String: (name: string, options?: ArgumentOptions): RequiredArgument<string> =>
    required(name, { kind: "string", read: readString(name) }, options),

  Integer: (name: string, options?: ArgumentOptions): RequiredArgument<number> =>
    required(name, { kind: "integer", read: readInteger(name) }, options),

  Boolean: (name: string, options?: ArgumentOptions): RequiredArgument<boolean> =>
    required(name, { kind: "boolean", read: readBoolean(name) }, options),

  Player: (name: string, options?: ArgumentOptions): RequiredArgument<Player> =>
    required(
      name,
      { kind: "player", read: (raw, source) => firstSelector<Player>(name, raw, source) },
      options,
    ),

  Players: (name: string, options?: ArgumentOptions): RequiredArgument<ReadonlyArray<Player>> =>
    required(
      name,
      { kind: "players", read: (raw, source) => readSelector<Player>(name, raw, source) },
      options,
    ),

  Entity: (name: string, options?: ArgumentOptions): RequiredArgument<Entity> =>
    required(
      name,
      { kind: "entity", read: (raw, source) => firstSelector<Entity>(name, raw, source) },
      options,
    ),

  Entities: (name: string, options?: ArgumentOptions): RequiredArgument<ReadonlyArray<Entity>> =>
    required(
      name,
      { kind: "entities", read: (raw, source) => readSelector<Entity>(name, raw, source) },
      options,
    ),

  World: (name: string, options?: ArgumentOptions): RequiredArgument<World> =>
    required(name, { kind: "world", read: (raw: unknown) => raw as World }, options),

  BlockPosition: (name: string, options?: ArgumentOptions): RequiredArgument<BlockPosition> =>
    required(
      name,
      {
        kind: "blockPosition",
        read: (raw, source) => readResolver<BlockPosition>(name, raw, source),
      },
      options,
    ),

  /**
   * Declares an argument backed by any Paper `ArgumentType`. The host builds
   * Brigadier from `type`; `resolve` runs against the command source.
   */
  paper: <T>(name: string, options: PaperArgumentOptions<T>): RequiredArgument<T> =>
    required(
      name,
      {
        kind: "paper",
        paper: options.type,
        read: (raw, source) => options.resolve(raw, source),
      },
      options,
    ),

  optional: <T>(argument: RequiredArgument<T>): OptionalArgument<T> => ({
    ...argument,
    optional: true,
  }),

  suggest: suggestArgument,
};
