import { Command, Commands } from "@effectmc/commands";
import { Plugin, PluginHost } from "@effectmc/core";
import { Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import { commandRegistrarLayer, makeFakeCommandRegistrar } from "./fake-commands";

const commandPlugin = (name: string, root: string, subcommands: ReadonlyArray<string>) =>
  Plugin(
    name,
    Layer.empty,
    Effect.gen(function* () {
      yield* Commands.attach(
        Command.make(root).pipe(
          Command.withSubcommands(
            subcommands.map((child) => Command.make(child, {}, () => Effect.void)),
          ),
        ),
      );
    }),
  );

test("reload re-registers the command tree, including a changed shape", async () => {
  const registrar = makeFakeCommandRegistrar();
  const host = PluginHost.make({ hostServices: commandRegistrarLayer(registrar) });

  await host.start(commandPlugin("warps", "warp", ["set"]));
  await host.start(commandPlugin("homes", "home", ["set"]));

  expect(registrar.roots().map((root) => root.name)).toEqual(["warp", "home"]);
  const homeBefore = registrar.roots().find((root) => root.name === "home");

  await host.reload(commandPlugin("warps", "warp", ["set", "go"]));

  // The command tree is re-registered with its new shape, and the other
  // plugin's tree is the same node it registered before the reload.
  const roots = registrar.roots();
  expect(roots.map((root) => root.name)).toEqual(["warp", "home"]);
  expect(roots[0]!.subcommands.map((child) => child.name)).toEqual(["set", "go"]);
  expect(roots.find((root) => root.name === "home")).toBe(homeBefore);

  // Commands are not registrations, so they never appear in the Registry.
  expect(host.registry("warps")?.entries()).toEqual([]);
  expect(host.registry("homes")?.entries()).toEqual([]);

  await host.dispose();
});

test("the command registrar offers no unregistration for a reload to attempt", () => {
  const registrar = makeFakeCommandRegistrar();

  expect(Object.keys(registrar).sort()).toEqual(["clear", "register", "roots"]);
  expect("unregister" in registrar).toBe(false);
});
