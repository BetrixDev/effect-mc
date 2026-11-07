import { Argument, Command, Commands, CommandRegistrar } from "@effectmc/commands";
import { Plugin, Sender } from "@effectmc/core";
import { Effect, Layer, Option } from "effect";
import { expect, test } from "vite-plus/test";
import { makeFakeCommandRegistrar } from "./fake-commands";
import { TestHarness } from "./harness";

test("a plugin program attaches commands through the runtime's registrar", async () => {
  const harness = TestHarness.make(
    Plugin(
      "warps",
      Layer.empty,
      Effect.gen(function* () {
        yield* Commands.attach(
          Command.make("warp").pipe(
            Command.withDescription("Manage warps"),
            Command.permission("effectmc.warp"),
            Command.withSubcommands([
              Command.make(
                "set",
                {
                  name: Argument.String("name"),
                  amount: Argument.optional(Argument.Integer("amount")),
                },
                (args) =>
                  Effect.gen(function* () {
                    const amount = Option.match(args.amount, {
                      onNone: () => "none",
                      onSome: (value) => String(value),
                    });
                    yield* Sender.send(`set ${args.name} ${amount}`);
                  }),
              ),
            ]),
          ),
        );
      }),
    ),
    { sender: { permissions: ["effectmc.warp"] } },
  );

  await harness.start();

  const roots = harness.commands.roots();
  expect(roots).toHaveLength(1);
  expect(roots[0]!.name).toBe("warp");
  expect(roots[0]!.subcommands.map((child) => child.name)).toEqual(["set"]);
  expect(harness.registry.entries()).toEqual([]);

  const setNode = roots[0]!.subcommands[0]!;
  await Effect.runPromise(
    setNode.execute({
      source: { sender: harness.sender },
      argument: (name) => (name === "name" ? "home" : undefined),
    }),
  );

  expect(harness.sender.messages()).toEqual(["set home none"]);

  await harness.teardown();
  expect(harness.registry.entries()).toEqual([]);
});

test("registering a root with the same label replaces it, as a reload does", async () => {
  const registrar = makeFakeCommandRegistrar();
  const provide = Effect.provideService(CommandRegistrar, registrar);

  const first = Command.make("warp").pipe(
    Command.withSubcommands([Command.make("set", {}, () => Effect.void)]),
  );
  const second = Command.make("warp").pipe(
    Command.withSubcommands([
      Command.make("set", {}, () => Effect.void),
      Command.make("go", {}, () => Effect.void),
    ]),
  );

  await Effect.runPromise(Commands.attach(first).pipe(provide));
  await Effect.runPromise(Commands.attach(second).pipe(provide));

  const roots = registrar.roots();
  expect(roots).toHaveLength(1);
  expect(roots[0]!.subcommands.map((child) => child.name)).toEqual(["set", "go"]);
});
