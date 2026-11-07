import { Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";
import { TickClock } from "./clock";
import { PluginAlreadyLoaded, PluginNotLoaded } from "./errors";
import { Events } from "./events";
import { PluginHost } from "./host";
import { Plugin } from "./plugin";
import { Registry } from "./registry";

class PingEvent {
  constructor(readonly id: string) {}
}

const pluginAdding = (name: string, registration: string) =>
  Plugin(
    name,
    Layer.empty,
    Effect.gen(function* () {
      const registry = yield* Registry;
      registry.add({ kind: "task", name: registration });
    }),
  );

const catchError = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (cause: unknown) => cause,
  );

test("starts one runtime per plugin and keeps their Registries separate", async () => {
  const host = PluginHost.make();
  const alpha = await host.start(pluginAdding("alpha", "alpha-task"));
  const beta = await host.start(pluginAdding("beta", "beta-task"));

  expect(host.names()).toEqual(["alpha", "beta"]);
  expect(host.status("alpha")).toBe("running");
  expect(host.status("beta")).toBe("running");
  expect(alpha.clock).toBe(host.clock);
  expect(beta.clock).toBe(host.clock);
  expect(host.registry("alpha")?.entries()).toEqual([{ kind: "task", name: "alpha-task" }]);
  expect(host.registry("beta")?.entries()).toEqual([{ kind: "task", name: "beta-task" }]);

  const alphaRegistry = host.registry("alpha");
  const betaRegistry = host.registry("beta");

  await host.dispose();

  expect(alphaRegistry?.entries()).toEqual([]);
  expect(betaRegistry?.entries()).toEqual([]);
  expect(host.names()).toEqual([]);
  expect(host.status("alpha")).toBeUndefined();
});

test("shares the host's tick clock with every plugin", async () => {
  const clock = new TickClock();
  const host = PluginHost.make({ clock });

  expect(host.clock).toBe(clock);

  const runtime = await host.start(Plugin("demo", Layer.empty, Effect.void));

  expect(runtime.clock).toBe(clock);

  await host.dispose();
});

test("reloads one plugin and leaves the others running", async () => {
  const host = PluginHost.make();
  const betaRuntime = await host.start(pluginAdding("beta", "beta-task"));
  const alphaRuntime = await host.start(pluginAdding("alpha", "alpha-v1"));

  const replacement = await host.reload(pluginAdding("alpha", "alpha-v2"));

  expect(alphaRuntime.status).toBe("disposed");
  expect(replacement).not.toBe(alphaRuntime);
  expect(replacement.status).toBe("running");
  expect(host.status("alpha")).toBe("running");
  expect(host.registry("alpha")?.entries()).toEqual([{ kind: "task", name: "alpha-v2" }]);

  // The other plugin keeps its runtime and its registrations.
  expect(betaRuntime.status).toBe("running");
  expect(host.status("beta")).toBe("running");
  expect(host.registry("beta")?.entries()).toEqual([{ kind: "task", name: "beta-task" }]);
  expect(host.names()).toEqual(["beta", "alpha"]);

  await host.dispose();
});

test("repeated reload cycles do not grow the Registry", async () => {
  const host = PluginHost.make();
  await host.start(pluginAdding("alpha", "sweep"));

  for (let cycle = 0; cycle < 50; cycle++) {
    await host.reload(pluginAdding("alpha", "sweep"));
  }

  expect(host.status("alpha")).toBe("running");
  expect(host.registry("alpha")?.entries()).toEqual([{ kind: "task", name: "sweep" }]);

  await host.dispose();
});

test("reload keeps other plugins' event listeners attached", async () => {
  const seen: Array<string> = [];
  const listening = (name: string) =>
    Plugin(
      name,
      Layer.empty,
      Effect.gen(function* () {
        yield* Events.attach(PingEvent, { mode: "sync" }, (event) =>
          Effect.sync(() => {
            seen.push(`${name}:${event.id}`);
          }),
        );
      }),
    );

  const host = PluginHost.make();
  await host.start(listening("alpha"));
  await host.start(listening("beta"));

  await host.reload(listening("alpha"));

  expect(host.registry("alpha")?.entries()).toEqual([
    { kind: "listener", name: "PingEvent:sync:normal" },
  ]);
  expect(host.registry("beta")?.entries()).toEqual([
    { kind: "listener", name: "PingEvent:sync:normal" },
  ]);

  host.eventBus("alpha")?.dispatch(PingEvent, new PingEvent("1"));
  host.eventBus("beta")?.dispatch(PingEvent, new PingEvent("2"));

  expect(seen).toEqual(["alpha:1", "beta:2"]);

  await host.dispose();
});

test("reports an unknown plugin instead of starting a replacement", async () => {
  const host = PluginHost.make();
  await host.start(pluginAdding("alpha", "alpha-task"));

  const error = await catchError(host.reload(pluginAdding("ghost", "ghost-task")));

  expect(error).toBeInstanceOf(PluginNotLoaded);
  expect(error).toMatchObject({
    _tag: "PluginNotLoaded",
    plugin: "ghost",
    loaded: ["alpha"],
  });
  expect((error as PluginNotLoaded).message).toContain("ghost");
  expect(host.names()).toEqual(["alpha"]);

  await host.dispose();
});

test("refuses to start the same plugin name twice", async () => {
  const host = PluginHost.make();
  await host.start(pluginAdding("alpha", "alpha-task"));

  const error = await catchError(host.start(pluginAdding("alpha", "other-task")));

  expect(error).toBeInstanceOf(PluginAlreadyLoaded);
  expect(error).toMatchObject({ _tag: "PluginAlreadyLoaded", plugin: "alpha" });
  expect(host.registry("alpha")?.entries()).toEqual([{ kind: "task", name: "alpha-task" }]);

  await host.dispose();
});

test("a failed reload stops that plugin and leaves the others untouched", async () => {
  const host = PluginHost.make();
  await host.start(pluginAdding("beta", "beta-task"));
  await host.start(pluginAdding("alpha", "alpha-task"));

  await expect(
    host.reload(Plugin("alpha", Layer.empty, Effect.fail(new Error("boom")))),
  ).rejects.toThrow("boom");

  expect(host.status("alpha")).toBe("failed");
  expect(host.registry("alpha")?.entries()).toEqual([]);
  expect(host.status("beta")).toBe("running");
  expect(host.registry("beta")?.entries()).toEqual([{ kind: "task", name: "beta-task" }]);

  // A later reload constructs a fresh runtime and recovers.
  await host.reload(pluginAdding("alpha", "alpha-recovered"));

  expect(host.status("alpha")).toBe("running");
  expect(host.registry("alpha")?.entries()).toEqual([{ kind: "task", name: "alpha-recovered" }]);

  await host.dispose();
});
