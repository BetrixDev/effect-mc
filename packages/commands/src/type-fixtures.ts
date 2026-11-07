/**
 * Compile-time fixtures for the command contract. This file is checked by
 * `tsc --noEmit`; each `@ts-expect-error` disappears if a constraint is lost.
 */
import type { CommandSourceStack, Player } from "@effectmc/paper-types";
import {
  AsyncThread,
  Main,
  PermissionDenied,
  Sender,
  SenderContext,
  type SenderValue,
} from "@effectmc/core";
import { Context, Effect, Option } from "effect";
import { Argument as ArgumentNamespace } from "./argument";
import { Command as CommandNamespace } from "./command";
import { Commands as CommandsNamespace, type CommandSource } from "./index";

class Provided extends Context.Service<Provided, { readonly value: number }>()("Provided") {}

const sender: SenderValue = {
  name: "alex",
  send: () => {},
  hasPermission: () => true,
};

const source: CommandSource = {
  sender,
  native: undefined as unknown as CommandSourceStack,
};

const invocation = {
  source,
  argument: (_name: string): unknown => undefined,
};

const suggestion = {
  ...invocation,
  remaining: "ho",
};

// A required argument is its bare type; an optional argument is an Option.
const warps = CommandNamespace.make(
  "warp",
  {
    name: ArgumentNamespace.String("name"),
    amount: ArgumentNamespace.optional(ArgumentNamespace.Integer("amount")),
    target: ArgumentNamespace.optional(ArgumentNamespace.Player("target")),
  },
  (args) =>
    Effect.gen(function* () {
      const name: string = args.name;
      const amount: Option.Option<number> = args.amount;
      const target: Option.Option<Player> = args.target;
      yield* Main;
      yield* SenderContext;
      void name;
      void amount;
      void target;
    }),
);

// A handler's Main and sender requirements are supplied per execution, so
// attach's own requirement is empty here.
export const attached: Effect.Effect<void, never, never> = CommandsNamespace.attach(warps);

// Attaching returns void: there is no registration handle to hold.
export const noHandle: Effect.Effect<void, never, never> = CommandsNamespace.attach(
  CommandNamespace.make("plain"),
);

// A required argument is a string, not an Option.
export const requiredIsNotOptional = CommandNamespace.make(
  "bad",
  { name: ArgumentNamespace.String("name") },
  (args) => {
    // @ts-expect-error A required argument is a string, not an Option.
    const wrong: Option.Option<string> = args.name;
    void wrong;
    return Effect.void;
  },
);

// An integer argument is a number.
export const integerIsNumber = CommandNamespace.make(
  "bad",
  { count: ArgumentNamespace.Integer("count") },
  (args) => {
    // @ts-expect-error An integer argument is a number.
    const wrong: string = args.count;
    void wrong;
    return Effect.void;
  },
);

// A handler's own service requirement stays in attach's requirement.
const needsProvided = CommandNamespace.make("provided", {}, () =>
  Effect.gen(function* () {
    yield* Provided;
  }),
);

export const attachNeedsProvided: Effect.Effect<void, never, Provided> =
  CommandsNamespace.attach(needsProvided);

// A subcommand's requirement propagates to the root's attach.
const rootWithChild = CommandNamespace.make("root").pipe(
  CommandNamespace.withSubcommands([needsProvided]),
);

export const attachChildNeedsProvided: Effect.Effect<void, never, Provided> =
  CommandsNamespace.attach(rootWithChild);

// @ts-expect-error The child's Provided requirement is not satisfied.
export const attachChildWithoutProvided: Effect.Effect<void, never, never> =
  CommandsNamespace.attach(rootWithChild);

// A suggestion provider runs with Main, and `Argument.suggest` supplies it.
const suggesting = ArgumentNamespace.String("name", {
  suggest: () =>
    Effect.gen(function* () {
      yield* Main;
      return ["home"];
    }),
});

export const suggestions: Effect.Effect<ReadonlyArray<string>> = ArgumentNamespace.suggest(
  suggesting,
  suggestion,
);

// A suggestion provider runs with Main, not AsyncThread.
export const suggestionNeedsAsync = ArgumentNamespace.String("name", {
  // @ts-expect-error A suggestion provider runs with Main, not AsyncThread.
  suggest: () =>
    Effect.gen(function* () {
      yield* AsyncThread;
      return [];
    }),
});

// Command.run supplies Main and SenderContext, so a handler using Sender needs
// no extra requirement beyond the command's own PermissionDenied channel.
export const runsWithSender: Effect.Effect<void, PermissionDenied, never> = CommandNamespace.run(
  CommandNamespace.make("hello", {}, () => Sender.send("hi")),
  invocation,
);
