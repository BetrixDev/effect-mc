import { Main, PermissionDenied, SenderContext, type SenderValue } from "@effectmc/core";
import { Effect, Pipeable } from "effect";
import {
  type ArgumentRecord,
  type AnyCommandArgument,
  type CommandArgs,
  type CommandInvocation,
  resolveArguments,
} from "./argument";

/**
 * A declared command. `A` is the record a handler receives, `E` the handler's
 * error channel, and `R` the services its handler needs beyond the `Main` and
 * command sender the executor supplies.
 *
 * Commands are values, not registrations: `Commands.attach` attaches one and
 * returns nothing because Brigadier offers no unregister (ADR-0011).
 */
export interface Command<A = void, E = never, R = never> extends Pipeable.Pipeable {
  readonly name: string;
  readonly description?: string;
  readonly permission?: string;
  readonly arguments: ReadonlyArray<AnyCommandArgument>;
  readonly subcommands: ReadonlyArray<AnyCommand>;
  readonly handler?: (args: A) => Effect.Effect<void, E, R>;
}

/**
 * Any command, regardless of its argument, error, or requirement types. Used
 * where a tree stores heterogeneous children.
 */
export type AnyCommand = Command<never, unknown, unknown>;

type ErrorOf<C> = C extends Command<never, infer E, unknown> ? E : never;
type RequirementOf<C> = C extends Command<never, unknown, infer R> ? R : never;

const commandNamePattern = /^\S+$/;

const validateCommandName = (name: string): string => {
  if (typeof name !== "string" || !commandNamePattern.test(name)) {
    throw new TypeError("A command name must be a non-empty string without whitespace.");
  }
  return name;
};

const validateSubcommands = (command: AnyCommand, children: ReadonlyArray<AnyCommand>): void => {
  const names = new Set(command.subcommands.map((child) => child.name));
  for (const child of children) {
    if (names.has(child.name)) {
      throw new TypeError(`Subcommand '${child.name}' is declared more than once.`);
    }
    names.add(child.name);
  }
};

const pipeable = (command: Omit<AnyCommand, "pipe">): AnyCommand => {
  Object.assign(command, {
    pipe(this: unknown): unknown {
      return Pipeable.pipeArguments(this, arguments);
    },
  });
  return command as AnyCommand;
};

export function make(name: string): Command<void, never, never>;
export function make<const Args extends ArgumentRecord, E = never, R = never>(
  name: string,
  args: Args,
  handler: (args: CommandArgs<Args>) => Effect.Effect<void, E, R>,
): Command<CommandArgs<Args>, E, R>;
export function make(
  name: string,
  args: ArgumentRecord = {},
  handler?: (args: never) => Effect.Effect<void, unknown, unknown>,
): AnyCommand {
  const declared = Object.values(args);

  return pipeable({
    name: validateCommandName(name),
    arguments: declared,
    subcommands: [],
    handler,
  });
}

/**
 * Adds the description shown by command help. `description` is display text;
 * it does not affect dispatch.
 */
export const withDescription =
  (description: string) =>
  <A, E, R>(command: Command<A, E, R>): Command<A, E, R> => ({
    ...command,
    description,
  });

/**
 * Declares the permission enforced in Brigadier's `requires` predicate and
 * again at execution. It is EffectMC's own concept, not effect/cli's
 * (ADR-0019).
 */
export const permission =
  (value: string) =>
  <A, E, R>(command: Command<A, E, R>): Command<A, E, R> => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new TypeError("A command permission must be a non-empty string.");
    }
    return { ...command, permission: value };
  };

/**
 * Adds subcommands to a command. Their error and requirement types join the
 * parent's so `Commands.attach` captures everything their handlers need.
 */
export const withSubcommands =
  <const Children extends ReadonlyArray<AnyCommand>>(children: Children) =>
  <A, E, R>(
    command: Command<A, E, R>,
  ): Command<A, E | ErrorOf<Children[number]>, R | RequirementOf<Children[number]>> => {
    validateSubcommands(command, children);
    const widened: Command<A, E | ErrorOf<Children[number]>, R | RequirementOf<Children[number]>> =
      {
        ...command,
        subcommands: [...command.subcommands, ...children],
      };
    return widened;
  };

/** The one place a permission failure is constructed, so every boundary agrees. */
export const permissionDenied = (permission: string, sender: SenderValue): PermissionDenied =>
  new PermissionDenied({
    permission,
    sender: sender.name,
    message: `Sender '${sender.name}' lacks permission '${permission}'.`,
  });

/**
 * Executes one command with the arguments an invocation resolved. It supplies
 * `Main` and the command's sender, so a handler never declares them, and
 * re-checks the permission passed at registration.
 *
 * This is the execution seam: the Paper host and unit tests call it with a
 * real or fake invocation, then decide how a failure reaches the sender
 * (ADR-0005).
 */
export function run<A, E, R>(
  command: Command<A, E, R>,
  invocation: CommandInvocation,
): Effect.Effect<void, E | PermissionDenied, Exclude<Exclude<R, Main>, SenderContext>> {
  const execute = Effect.gen(function* () {
    const required = command.permission;
    if (required !== undefined && invocation.source.sender.hasPermission?.(required) !== true) {
      return yield* Effect.fail(permissionDenied(required, invocation.source.sender));
    }

    const args = resolveArguments(command.arguments, invocation) as A;
    if (command.handler === undefined) {
      return;
    }

    return yield* command.handler(args);
  });

  return execute.pipe(
    Effect.provideService(Main, { region: undefined }),
    Effect.provideService(SenderContext, invocation.source.sender),
  );
}

/** The command author surface: declare a tree and run one node. */
export const Command = {
  make,
  withDescription,
  permission,
  withSubcommands,
  run,
};
