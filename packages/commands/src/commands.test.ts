import type { BlockPosition, CommandSourceStack, Player } from "@effectmc/paper-types";
import { Main, PermissionDenied, Sender, SenderNotPlayer, type SenderValue } from "@effectmc/core";
import { Effect, Exit, Option } from "effect";
import { expect, test } from "vite-plus/test";
import {
  Argument,
  Command,
  Commands,
  CommandRegistrar,
  type CommandInvocation,
  type CommandNode,
  type CommandRegistrarService,
  type CommandSource,
} from "./index";

interface RecordedSource {
  readonly source: CommandSource;
  readonly messages: Array<string>;
}

const makeSource = (
  options: {
    readonly name?: string;
    readonly permissions?: ReadonlyArray<string>;
    readonly player?: Player;
    readonly native?: CommandSourceStack;
  } = {},
): RecordedSource => {
  const messages: Array<string> = [];
  const permissions = options.permissions ?? [];
  const sender: SenderValue = {
    name: options.name ?? "tester",
    player: options.player,
    send: (message) => {
      messages.push(message);
    },
    hasPermission: (permission) => permissions.includes(permission),
  };

  return {
    messages,
    source: {
      sender,
      native: options.native,
    },
  };
};

const invocation = (
  source: CommandSource,
  argumentsByName: Readonly<Record<string, unknown>> = {},
): CommandInvocation => ({
  source,
  argument: (name) => argumentsByName[name],
});

interface FakeRegistrar {
  readonly service: CommandRegistrarService;
  readonly roots: () => ReadonlyArray<CommandNode>;
}

const makeRegistrar = (): FakeRegistrar => {
  const roots: Array<CommandNode> = [];
  return {
    roots: () => roots.slice(),
    service: {
      register: (root) => {
        roots.push(root);
      },
    },
  };
};

const attachTo = <A, E, R>(registrar: FakeRegistrar, command: Command<A, E, R>) =>
  Commands.attach(command).pipe(Effect.provideService(CommandRegistrar, registrar.service));

test("a command tree with subcommands and required/optional arguments registers", async () => {
  const captured: Array<unknown> = [];
  const set = Command.make(
    "set",
    {
      name: Argument.String("name"),
      amount: Argument.optional(Argument.Integer("amount")),
    },
    (args) =>
      Effect.sync(() => {
        captured.push(args);
      }),
  );

  const root = Command.make("warp").pipe(
    Command.withDescription("Manage warps"),
    Command.permission("effectmc.warp"),
    Command.withSubcommands([set]),
  );

  const registrar = makeRegistrar();
  const exit = await Effect.runPromiseExit(attachTo(registrar, root));

  expect(Exit.isSuccess(exit)).toBe(true);
  expect(registrar.roots()).toHaveLength(1);

  const node = registrar.roots()[0]!;
  expect(node.name).toBe("warp");
  expect(node.description).toBe("Manage warps");
  expect(node.permission).toBe("effectmc.warp");
  expect(node.subcommands.map((child) => child.name)).toEqual(["set"]);
  expect(node.subcommands[0]!.arguments.map((argument) => argument.name)).toEqual([
    "name",
    "amount",
  ]);

  const setNode = node.subcommands[0]!;
  await Effect.runPromise(
    setNode.execute(
      invocation(makeSource({ permissions: ["effectmc.warp"] }).source, {
        name: "home",
        amount: 2,
      }),
    ),
  );

  expect(captured).toEqual([{ name: "home", amount: Option.some(2) }]);
});

test("an omitted optional argument arrives as Option.none", async () => {
  let received: { readonly name: string; readonly amount: Option.Option<number> } | undefined;
  const command = Command.make(
    "set",
    {
      name: Argument.String("name"),
      amount: Argument.optional(Argument.Integer("amount")),
    },
    (args) =>
      Effect.sync(() => {
        received = args;
      }),
  );

  await Effect.runPromise(Command.run(command, invocation(makeSource().source, { name: "home" })));

  expect(received?.name).toBe("home");
  expect(Option.isNone(received!.amount)).toBe(true);
});

test("command execution holds Main and the command's sender", async () => {
  let sawMain = false;
  const source = makeSource({ name: "alex" });
  const command = Command.make("where", {}, () =>
    Effect.gen(function* () {
      yield* Main;
      sawMain = true;
      yield* Sender.send("here");
    }),
  );

  await Effect.runPromise(Command.run(command, invocation(source.source)));

  expect(sawMain).toBe(true);
  expect(source.messages).toEqual(["here"]);
});

test("permission is checked at registration and again at execution", async () => {
  let ran = 0;
  const command = Command.make("warp", {}, () =>
    Effect.sync(() => {
      ran += 1;
    }),
  ).pipe(Command.permission("effectmc.warp"));

  const registrar = makeRegistrar();
  await Effect.runPromise(attachTo(registrar, command));
  const node = registrar.roots()[0]!;

  expect(node.requires({ hasPermission: (permission) => permission === "effectmc.warp" })).toBe(
    true,
  );
  expect(node.requires({ hasPermission: () => false })).toBe(false);

  const denied = await Effect.runPromiseExit(Command.run(command, invocation(makeSource().source)));
  expect(Exit.isFailure(denied)).toBe(true);
  const error = Exit.findErrorOption(denied);
  expect(Option.getOrThrow(error)).toBeInstanceOf(PermissionDenied);
  expect(Option.getOrThrow(error)).toMatchObject({
    _tag: "PermissionDenied",
    permission: "effectmc.warp",
    sender: "tester",
  });
  expect(ran).toBe(0);

  await Effect.runPromise(
    Command.run(command, invocation(makeSource({ permissions: ["effectmc.warp"] }).source)),
  );
  expect(ran).toBe(1);
});

test("a permission declared on a parent protects its subcommands", async () => {
  let ran = 0;
  const go = Command.make("go", {}, () =>
    Effect.sync(() => {
      ran += 1;
    }),
  );
  const root = Command.make("warp").pipe(
    Command.permission("effectmc.warp"),
    Command.withSubcommands([go]),
  );

  const registrar = makeRegistrar();
  await Effect.runPromise(attachTo(registrar, root));

  const rootNode = registrar.roots()[0]!;
  const goNode = rootNode.subcommands[0]!;
  expect(rootNode.requires({ hasPermission: () => false })).toBe(false);
  expect(goNode.requires({ hasPermission: () => false })).toBe(false);

  const denied = await Effect.runPromiseExit(goNode.execute(invocation(makeSource().source)));
  expect(Exit.isFailure(denied)).toBe(true);
  expect(Option.getOrThrow(Exit.findErrorOption(denied))).toMatchObject({
    _tag: "PermissionDenied",
    permission: "effectmc.warp",
  });
  expect(ran).toBe(0);

  await Effect.runPromise(
    goNode.execute(invocation(makeSource({ permissions: ["effectmc.warp"] }).source)),
  );
  expect(ran).toBe(1);
});

test("a console sender hitting a player-only command fails with SenderNotPlayer", async () => {
  const command = Command.make("sethome", {}, () =>
    Effect.gen(function* () {
      yield* Sender.asPlayer;
    }),
  );

  const registrar = makeRegistrar();
  await Effect.runPromise(attachTo(registrar, command));
  const node = registrar.roots()[0]!;

  const exit = await Effect.runPromiseExit(
    node.execute(invocation(makeSource({ name: "console" }).source)),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  const error = Option.getOrThrow(Exit.findErrorOption(exit));
  expect(error).toBeInstanceOf(SenderNotPlayer);
  expect(error).toMatchObject({ _tag: "SenderNotPlayer", sender: "console" });
  expect((error as SenderNotPlayer).message).toContain("not a player");
});

test("a Paper player argument resolves against the command source", async () => {
  const player = { name: "alex" } as unknown as Player;
  const native = { id: "native" } as unknown as CommandSourceStack;
  let received: Player | undefined;

  const command = Command.make("teleport", { target: Argument.Player("target") }, (args) =>
    Effect.sync(() => {
      received = args.target;
    }),
  );

  const resolver = {
    resolve: (source: CommandSourceStack) => {
      expect(source).toBe(native);
      return [player];
    },
  };

  await Effect.runPromise(
    Command.run(command, invocation(makeSource({ native }).source, { target: resolver })),
  );

  expect(received).toBe(player);
});

test("a Paper position argument resolves against the command source", async () => {
  const position = { blockX: () => 1 } as unknown as BlockPosition;
  const native = { id: "native" } as unknown as CommandSourceStack;
  let received: BlockPosition | undefined;

  const command = Command.make("setblock", { where: Argument.BlockPosition("where") }, (args) =>
    Effect.sync(() => {
      received = args.where;
    }),
  );

  const resolver = {
    resolve: (source: CommandSourceStack) => {
      expect(source).toBe(native);
      return position;
    },
  };

  await Effect.runPromise(
    Command.run(command, invocation(makeSource({ native }).source, { where: resolver })),
  );

  expect(received).toBe(position);
});

test("suggestions run with Main and see the dispatch source", async () => {
  const seen: Array<string> = [];
  const argument = Argument.String("name", {
    suggest: (request) =>
      Effect.gen(function* () {
        yield* Main;
        seen.push(request.remaining);
        return [request.source.sender.name, "home", "house"];
      }),
  });

  const values = await Effect.runPromise(
    Argument.suggest(argument, {
      ...invocation(makeSource({ name: "alex" }).source),
      remaining: "ho",
    }),
  );

  expect(values).toEqual(["alex", "home", "house"]);
  expect(seen).toEqual(["ho"]);
});

test("an argument without a provider suggests nothing", async () => {
  const values = await Effect.runPromise(
    Argument.suggest(Argument.String("name"), {
      ...invocation(makeSource().source),
      remaining: "",
    }),
  );

  expect(values).toEqual([]);
});

test("a command with no handler registers and executes as a no-op", async () => {
  const root = Command.make("warp").pipe(
    Command.withSubcommands([Command.make("go", {}, () => Effect.void)]),
  );

  const registrar = makeRegistrar();
  await Effect.runPromise(attachTo(registrar, root));

  const node = registrar.roots()[0]!;
  await expect(Effect.runPromise(node.execute(invocation(makeSource().source)))).resolves.toBe(
    undefined,
  );
});
