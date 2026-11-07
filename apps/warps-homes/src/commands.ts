import { Argument, Command } from "@effectmc/commands";
import { Pdc, Players, Sender } from "@effectmc/core";
import { Effect, Option } from "effect";
import { HomeNotSet, HomeWorldMissing, homeFrom, Keys } from "./home";
import { PaperPlatform } from "./platform";
import { WarpService } from "./warp-service";

const warpSet = Command.make("set", { name: Argument.String("name") }, (args) =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer;
    const warps = yield* WarpService;

    yield* warps.set(args.name, player.getLocation());
    yield* Sender.send(`Warp '${args.name}' set.`);
  }),
);

const warpGo = Command.make("go", { name: Argument.String("name") }, (args) =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer;
    const warps = yield* WarpService;
    const location = yield* warps.get(args.name);

    const moved = yield* Players.teleport(player, location);
    if (!moved) {
      yield* Sender.send(`Could not warp to '${args.name}'.`);
      return;
    }
    yield* Sender.send(`Warped to '${args.name}'.`);
  }),
);

const warpList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const warps = yield* WarpService;
    const names = yield* warps.list;

    yield* Sender.send(names.length === 0 ? "No warps are set." : names.join(", "));
  }),
);

/** `/warp set|go|list`, protected as one subtree by the parent permission. */
export const warpCommand = Command.make("warp").pipe(
  Command.withDescription("Travel between warps"),
  Command.permission("effectmc.warp"),
  Command.withSubcommands([warpSet, warpGo, warpList]),
);

const homeSet = Command.make("set", {}, () =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer;

    yield* Pdc.set(player, Keys.home, homeFrom(player.getLocation()));
    yield* Sender.send("Home set.");
  }),
);

const homeGo = Command.make("go", {}, () =>
  Effect.gen(function* () {
    const player = yield* Sender.asPlayer;
    const platform = yield* PaperPlatform;
    const stored = yield* Pdc.get(player, Keys.home);

    if (Option.isNone(stored)) {
      return yield* Effect.fail(
        new HomeNotSet({ message: "No home is set. Use /home set first." }),
      );
    }

    const location = platform.resolveHome(stored.value);
    if (location === undefined) {
      return yield* Effect.fail(
        new HomeWorldMissing({
          world: stored.value.world,
          message: `Home world '${stored.value.world}' is not loaded.`,
        }),
      );
    }

    const moved = yield* Players.teleport(player, location);
    if (!moved) {
      yield* Sender.send("Could not teleport to your home.");
      return;
    }
    yield* Sender.send("Welcome home.");
  }),
);

/** `/home set|go`, with the home persisted on the player. */
export const homeCommand = Command.make("home").pipe(
  Command.withDescription("Set and return to your home"),
  Command.permission("effectmc.home"),
  Command.withSubcommands([homeSet, homeGo]),
);
