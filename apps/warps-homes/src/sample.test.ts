import type { CommandNode } from "@effectmc/commands";
import {
  isPlugin,
  Events,
  Observability,
  Plugin,
  PluginHost,
  type EventClass,
  type SenderValue,
} from "@effectmc/core";
import type {
  Location,
  PersistentDataContainer,
  Player,
  PlayerJoinEvent,
  World,
} from "@effectmc/paper-types";
import {
  commandRegistrarLayer,
  makeFakeCommandRegistrar,
  makeFakePdc,
  makeFakePdcPlatform,
  makeFakeSender,
  type FakeCommandRegistrar,
  type FakePdc,
} from "@effectmc/test";
import { Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import samplePlugin, { makeWarpsHomes, PaperPlatform } from "./index";

class FakePlayerJoinEvent {
  constructor(private readonly player: Player) {}

  getPlayer(): Player {
    return this.player;
  }
}

class NeighbourEvent {}

const makeWorld = (name: string): World => ({ getName: () => name }) as unknown as World;

const makeLocation = (world: World, x = 0, y = 64, z = 0, yaw = 0, pitch = 0): Location =>
  ({
    getWorld: () => world,
    getX: () => x,
    getY: () => y,
    getZ: () => z,
    getYaw: () => yaw,
    getPitch: () => pitch,
    clone: () => makeLocation(world, x, y, z, yaw, pitch),
  }) as unknown as Location;

interface Fixture {
  readonly host: PluginHost;
  readonly plugin: ReturnType<typeof makeWarpsHomes>;
  readonly platform: Layer.Layer<PaperPlatform>;
  readonly registrar: FakeCommandRegistrar;
  readonly pdc: FakePdc;
  readonly sender: SenderValue;
  readonly player: Player;
  readonly teleports: ReadonlyArray<Location>;
  readonly logs: ReadonlyArray<string>;
  readonly messages: () => ReadonlyArray<string>;
  readonly moveTo: (x: number, y: number, z: number) => void;
}

const fixture = (
  options: {
    readonly permissions?: ReadonlyArray<string>;
    readonly console?: boolean;
    readonly missingHomeWorld?: boolean;
    readonly teleportFails?: boolean;
  } = {},
): Fixture => {
  const registrar = makeFakeCommandRegistrar();
  const pdc = makeFakePdc();
  const container = pdc as unknown as PersistentDataContainer;
  const world = makeWorld("world");
  const worlds = new Map<string, World>([["world", world]]);

  const teleports: Array<Location> = [];
  let current = makeLocation(world, 10, 64, 10);
  const player = {
    getName: () => "alex",
    getWorld: () => world,
    getLocation: () => current,
    getPersistentDataContainer: () => container,
    teleport: (target: Location) => {
      if (options.teleportFails === true) {
        return false;
      }
      teleports.push(target);
      current = target;
      return true;
    },
  } as unknown as Player;

  const base = makeFakeSender("alex", {
    permissions: options.permissions ?? ["effectmc.warp", "effectmc.home"],
  });
  const sender: SenderValue = {
    name: base.name,
    send: base.send,
    hasPermission: base.hasPermission,
    ...(options.console === true ? {} : { player }),
  };

  const logs: Array<string> = [];
  const platform = Layer.succeed(PaperPlatform, {
    playerJoin: FakePlayerJoinEvent as unknown as EventClass<PlayerJoinEvent>,
    resolveHome: (home) => {
      if (options.missingHomeWorld === true) {
        return undefined;
      }
      const target = worlds.get(home.world);
      return target === undefined
        ? undefined
        : makeLocation(target, home.x, home.y, home.z, home.yaw, home.pitch);
    },
  });

  const plugin = makeWarpsHomes({ platform });
  const host = PluginHost.make({
    development: false,
    sender,
    pdcPlatform: makeFakePdcPlatform(),
    hostServices: commandRegistrarLayer(registrar),
    observability: Layer.succeed(Observability, {
      log: (_level, message) =>
        Effect.sync(() => {
          logs.push(message);
        }),
    }),
  });

  return {
    host,
    plugin,
    platform,
    registrar,
    pdc,
    sender,
    player,
    teleports,
    logs,
    messages: base.messages,
    moveTo: (x, y, z) => {
      current = makeLocation(world, x, y, z);
    },
  };
};

const nodeAt = (
  roots: ReadonlyArray<CommandNode>,
  root: string,
  ...path: ReadonlyArray<string>
): CommandNode => {
  let node: CommandNode | undefined = roots.find((candidate) => candidate.name === root);
  if (node === undefined) {
    throw new Error(`No command root '${root}' was registered.`);
  }

  for (const name of path) {
    const child: CommandNode | undefined = node.subcommands.find(
      (candidate) => candidate.name === name,
    );
    if (child === undefined) {
      throw new Error(`No subcommand '${name}' under '${node.name}'.`);
    }
    node = child;
  }

  return node;
};

const invoke = async (
  registrar: FakeCommandRegistrar,
  sender: SenderValue,
  root: string,
  path: ReadonlyArray<string>,
  args: Readonly<Record<string, unknown>> = {},
): Promise<void> => {
  const node = nodeAt(registrar.roots(), root, ...path);
  await Effect.runPromise(
    node.dispatch({
      source: { sender },
      argument: (name) => args[name],
    }),
  );
};

const neighbour = () =>
  Plugin(
    "neighbour",
    Layer.empty,
    Effect.gen(function* () {
      yield* Events.attach(NeighbourEvent, { mode: "sync" }, () => Effect.void);
    }),
  );

test("enables and registers the warp and home command trees", async () => {
  const f = fixture();

  expect(isPlugin(samplePlugin)).toBe(true);
  expect(samplePlugin.name).toBe("warps-homes");
  expect(isPlugin(f.plugin)).toBe(true);
  expect(f.plugin.name).toBe("warps-homes");

  await f.host.start(f.plugin);

  expect(f.host.status("warps-homes")).toBe("running");
  expect(f.registrar.roots().map((root) => root.name)).toEqual(["warp", "home"]);
  expect(nodeAt(f.registrar.roots(), "warp").subcommands.map((child) => child.name)).toEqual([
    "set",
    "go",
    "list",
  ]);
  expect(nodeAt(f.registrar.roots(), "home").subcommands.map((child) => child.name)).toEqual([
    "set",
    "go",
  ]);

  expect(
    nodeAt(f.registrar.roots(), "warp").requires({
      hasPermission: (permission) => permission === "effectmc.warp",
    }),
  ).toBe(true);
  expect(nodeAt(f.registrar.roots(), "warp").requires({ hasPermission: () => false })).toBe(false);

  // The only registration is the join listener; commands are re-registered on
  // reload and never recorded in the Registry (ADR-0011).
  expect(f.host.registry("warps-homes")?.entries()).toEqual([
    { kind: "listener", name: "FakePlayerJoinEvent:sync:normal" },
  ]);

  await f.host.dispose();
});

test("a warp is stored in the service and /warp go teleports to it", async () => {
  const f = fixture();
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "warp", ["list"]);
  expect(f.messages()).toContain("No warps are set.");

  await invoke(f.registrar, f.sender, "warp", ["set"], { name: "spawn" });
  expect(f.messages()).toContain("Warp 'spawn' set.");
  expect(f.teleports).toHaveLength(0);

  await invoke(f.registrar, f.sender, "warp", ["go"], { name: "spawn" });

  const target = f.teleports.at(-1)!;
  expect([target.getX(), target.getY(), target.getZ()]).toEqual([10, 64, 10]);
  expect(f.messages()).toContain("Warped to 'spawn'.");

  await invoke(f.registrar, f.sender, "warp", ["list"]);
  expect(f.messages()).toContain("spawn");

  await f.host.dispose();
});

test("a rejected teleport is reported instead of claiming success", async () => {
  const f = fixture({ teleportFails: true });
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "warp", ["set"], { name: "spawn" });
  await invoke(f.registrar, f.sender, "warp", ["go"], { name: "spawn" });

  expect(f.messages()).toContain("Could not warp to 'spawn'.");
  expect(f.messages()).not.toContain("Warped to 'spawn'.");

  await f.host.dispose();
});

test("a missing warp renders a tagged failure instead of throwing", async () => {
  const f = fixture();
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "warp", ["go"], { name: "missing" });

  expect(f.messages()).toContain("Warp 'missing' is not set.");
  expect(f.logs).toContain("Command 'go' failed with WarpNotFound.");

  await f.host.dispose();
});

test("a home is stored in the player's persistent data and /home go teleports to it", async () => {
  const f = fixture();
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "home", ["set"]);
  expect(f.messages()).toContain("Home set.");

  const stored = f.pdc.get({ namespace: "warps-homes", key: "home" }) as FakePdc | undefined;
  expect(stored).toBeDefined();
  expect(stored!.get({ namespace: "warps-homes", key: "world" })).toBe("world");
  expect(stored!.get({ namespace: "warps-homes", key: "x" })).toBe(10);

  f.moveTo(0, 70, 0);
  await invoke(f.registrar, f.sender, "home", ["go"]);

  const target = f.teleports.at(-1)!;
  expect([target.getX(), target.getY(), target.getZ()]).toEqual([10, 64, 10]);
  expect(f.messages()).toContain("Welcome home.");

  await f.host.dispose();
});

test("a missing home renders a tagged failure instead of throwing", async () => {
  const f = fixture();
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "home", ["go"]);

  expect(f.messages()).toContain("No home is set. Use /home set first.");
  expect(f.logs).toContain("Command 'go' failed with HomeNotSet.");

  await f.host.dispose();
});

test("a home in an unloaded world renders a tagged failure instead of throwing", async () => {
  const f = fixture({ missingHomeWorld: true });
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "home", ["set"]);
  await invoke(f.registrar, f.sender, "home", ["go"]);

  expect(f.messages()).toContain("Home world 'world' is not loaded.");
  expect(f.logs).toContain("Command 'go' failed with HomeWorldMissing.");

  await f.host.dispose();
});

test("a command tree's permission is enforced at execution and rendered", async () => {
  const f = fixture({ permissions: [] });
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "warp", ["go"], { name: "spawn" });

  expect(f.messages()).toContain("You do not have permission to use this command.");
  expect(f.logs).toContain("Command 'go' failed with PermissionDenied.");

  await f.host.dispose();
});

test("a console sender gets SenderNotPlayer, not PermissionDenied", async () => {
  const f = fixture({ console: true });
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "warp", ["set"], { name: "spawn" });

  expect(f.messages()).toContain("This command can only be run by a player.");
  expect(f.messages()).not.toContain("You do not have permission to use this command.");
  expect(f.logs).toContain("Command 'set' failed with SenderNotPlayer.");

  await f.host.dispose();
});

test("a scoped reload keeps the plugin usable and leaves a neighbour alone", async () => {
  const f = fixture();
  const neighbourPlugin = neighbour();
  await f.host.start(neighbourPlugin);
  await f.host.start(f.plugin);

  await invoke(f.registrar, f.sender, "warp", ["set"], { name: "spawn" });
  await invoke(f.registrar, f.sender, "home", ["set"]);

  const neighbourRegistry = f.host.registry("neighbour")!;
  const neighbourStatus = f.host.status("neighbour");

  const replacement = makeWarpsHomes({ platform: f.platform });
  const runtime = await f.host.reload(replacement);

  expect(runtime.status).toBe("running");
  expect(f.host.status("neighbour")).toBe(neighbourStatus);
  expect(neighbourRegistry.entries()).toEqual([
    { kind: "listener", name: "NeighbourEvent:sync:normal" },
  ]);
  expect(f.registrar.roots().map((root) => root.name)).toEqual(["warp", "home"]);

  // The home lives in the player's PDC, outside the rebuilt runtime.
  await invoke(f.registrar, f.sender, "home", ["go"]);
  expect(f.messages()).toContain("Welcome home.");

  // The warp lives in the rebuilt Layer, so it is gone until it is set again.
  await invoke(f.registrar, f.sender, "warp", ["go"], { name: "spawn" });
  expect(f.messages()).toContain("Warp 'spawn' is not set.");

  f.moveTo(3, 65, 3);
  await invoke(f.registrar, f.sender, "warp", ["set"], { name: "spawn" });
  await invoke(f.registrar, f.sender, "warp", ["go"], { name: "spawn" });

  const target = f.teleports.at(-1)!;
  expect([target.getX(), target.getY(), target.getZ()]).toEqual([3, 65, 3]);

  // The listener is re-attached by the rebuilt program, not just the commands.
  f.pdc.remove({ namespace: "warps-homes", key: "seen" });
  f.host.eventBus("warps-homes")!.dispatch(FakePlayerJoinEvent, new FakePlayerJoinEvent(f.player));
  expect(f.pdc.get({ namespace: "warps-homes", key: "seen" })).toBe("world");

  await f.host.dispose();
});

test("disabling leaves no listener, task, or GUI registration behind", async () => {
  const f = fixture();
  await f.host.start(f.plugin);

  const registry = f.host.registry("warps-homes")!;
  const bus = f.host.eventBus("warps-homes")!;

  expect(registry.entries()).toEqual([
    { kind: "listener", name: "FakePlayerJoinEvent:sync:normal" },
  ]);
  expect(registry.entries().filter((entry) => entry.kind === "task")).toEqual([]);
  expect(registry.entries().filter((entry) => entry.kind === "gui")).toEqual([]);

  bus.dispatch(FakePlayerJoinEvent, new FakePlayerJoinEvent(f.player));
  expect(f.pdc.get({ namespace: "warps-homes", key: "seen" })).toBe("world");

  await f.host.dispose();

  expect(f.host.names()).toEqual([]);
  expect(f.host.status("warps-homes")).toBeUndefined();
  expect(registry.entries()).toEqual([]);
  expect(bus.listeners()).toEqual([]);

  // A dispatch after teardown reaches no handler.
  f.pdc.remove({ namespace: "warps-homes", key: "seen" });
  bus.dispatch(FakePlayerJoinEvent, new FakePlayerJoinEvent(f.player));
  expect(f.pdc.get({ namespace: "warps-homes", key: "seen" })).toBeUndefined();
});
