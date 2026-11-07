import type {
  ItemStack,
  Location,
  Material,
  PersistentDataContainer,
  Player,
  World,
} from "@effectmc/paper-types";
import { Effect, Exit, Option } from "effect";
import { expect, test } from "vite-plus/test";
import { SenderNotPlayer } from "./errors";
import { Items } from "./items";
import { Players } from "./players";
import { Sender, SenderContext, type SenderValue } from "./sender";
import { Main } from "./threads";
import { Worlds } from "./worlds";

const inMain = { region: undefined } as const;

const runInMain = <A, E>(effect: Effect.Effect<A, E, Main>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provideService(Main, inMain)));

const senderValue = (
  name: string,
  options: { readonly player?: Player } = {},
): { readonly value: SenderValue; readonly messages: Array<string> } => {
  const messages: Array<string> = [];
  return {
    messages,
    value: {
      name,
      player: options.player,
      send: (message) => {
        messages.push(message);
      },
    },
  };
};

test("Sender.send records a message through the ambient sender", async () => {
  const sender = senderValue("alex");

  await Effect.runPromise(
    Sender.send("hello").pipe(
      Effect.provideService(SenderContext, sender.value),
      Effect.provideService(Main, inMain),
    ),
  );

  expect(sender.messages).toEqual(["hello"]);
});

test("Sender.asPlayer returns the player behind the sender", async () => {
  const player = { name: "alex" } as unknown as Player;
  const sender = senderValue("alex", { player });

  const resolved = await Effect.runPromise(
    Sender.asPlayer.pipe(
      Effect.provideService(SenderContext, sender.value),
      Effect.provideService(Main, inMain),
    ),
  );

  expect(resolved).toBe(player);
});

test("Sender.asPlayer fails with SenderNotPlayer for a console sender", async () => {
  const sender = senderValue("console");

  const exit = await Effect.runPromiseExit(
    Sender.asPlayer.pipe(
      Effect.provideService(SenderContext, sender.value),
      Effect.provideService(Main, inMain),
    ),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  const error = Option.getOrThrow(Exit.findErrorOption(exit));
  expect(error).toBeInstanceOf(SenderNotPlayer);
  expect((error as SenderNotPlayer).sender).toBe("console");
  expect((error as SenderNotPlayer).message).toContain("not a player");
});

test("Players.teleport calls Paper on Main", async () => {
  const location = { x: 1, y: 64, z: 1 } as unknown as Location;
  const teleports: Array<Location> = [];
  const player = {
    teleport: (target: Location) => {
      teleports.push(target);
      return true;
    },
  } as unknown as Player;

  const moved = await runInMain(Players.teleport(player, location));

  expect(moved).toBe(true);
  expect(teleports).toEqual([location]);
});

test("Worlds reads and writes blocks on Main", async () => {
  const writes: Array<unknown> = [];
  const world = {
    getBlockAt: (location: Location) => ({ location }),
    setType: (x: number, y: number, z: number, material: Material) => {
      writes.push([x, y, z, material]);
    },
  } as unknown as World;
  const location = {
    getBlockX: () => 1,
    getBlockY: () => 2,
    getBlockZ: () => 3,
  } as unknown as Location;
  const material = { name: "stone" } as unknown as Material;

  const resolved = await runInMain(Worlds.blockAt(world, location));
  await runInMain(Worlds.setBlock(world, location, material));

  expect(resolved).toEqual({ location });
  expect(writes).toEqual([[1, 2, 3, material]]);
});

test("Items.editPdc runs the consumer on Main and returns its result", async () => {
  const stored = new Map<string, unknown>();
  const fakePdc = {
    set: (key: { readonly key: string }, value: unknown) => {
      stored.set(key.key, value);
    },
  };
  const pdc = fakePdc as unknown as PersistentDataContainer;
  const stack = {
    editPersistentDataContainer: (edit: (container: PersistentDataContainer) => void) => {
      edit(pdc);
      return true;
    },
  } as unknown as ItemStack;

  const result = await runInMain(
    Items.editPdc(stack, () => {
      fakePdc.set({ key: "owner" }, "alex");
      return "written";
    }),
  );

  expect(result).toBe("written");
  expect(stored.get("owner")).toBe("alex");
});

test("raw Bukkit access still compiles and runs outside the facades", async () => {
  let teleported = false;
  const player = {
    teleport: () => {
      teleported = true;
      return true;
    },
  } as unknown as Player;

  await Effect.runPromise(
    Effect.sync(() => {
      player.teleport({} as Location);
    }),
  );

  expect(teleported).toBe(true);
});
