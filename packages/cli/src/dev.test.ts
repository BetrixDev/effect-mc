import { expect, test } from "vite-plus/test";
import type { BuildResult, BuildSession, BuildSessionFactory } from "./build-session";
import type { BuildOutput, ContainerDeployer } from "./container";
import { runDev } from "./dev";
import type { RconSettings, ScopedReloader } from "./server/rcon";
import type { RunningServer, ServerHost, ServerOptions, ServerTarget } from "./server/server-host";
import { ManualTimers } from "./test-support/manual-timers";

const output: BuildOutput = {
  outDir: "/build",
  manifest: { name: "hello", version: "0.1.0", entry: "plugin.mjs" },
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not reached");
};

const fakeSession = () => {
  const listeners = new Set<(result: BuildResult) => void>();
  const closed: boolean[] = [];
  const session: BuildSession = {
    first: Promise.resolve({ ok: true, output }),
    onBuild(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      closed.push(true);
    },
  };
  const factory: BuildSessionFactory = {
    async start() {
      return session;
    },
  };
  return {
    factory,
    closed,
    emit(result: BuildResult) {
      for (const listener of listeners) listener(result);
    },
  };
};

const fakeServers = (managed: boolean) => {
  const events: string[] = [];
  const prepared: ServerOptions[] = [];
  const targets: ServerTarget[] = [];
  const stopping: boolean[] = [];
  const reloaded: string[] = [];
  const reloader: ScopedReloader = {
    async reload(name) {
      events.push(`reload:${name}`);
      reloaded.push(name);
    },
  };

  const servers: ServerHost = {
    async prepare(options) {
      events.push("prepare");
      prepared.push(options);
      const rcon = { host: "127.0.0.1", port: 25575, password: "secret" } satisfies RconSettings;
      return managed
        ? {
            managed: true,
            directory: "/managed",
            rcon,
            javaCommand: "java",
            paperJar: "/cache/paper.jar",
          }
        : { managed: false, directory: "/existing", rcon, javaCommand: "java" };
    },
    async start(target): Promise<RunningServer> {
      events.push("start");
      targets.push(target);
      return {
        directory: target.directory,
        reloader,
        async stop() {
          events.push("stop");
          stopping.push(true);
        },
      };
    },
  };

  return { servers, events, prepared, targets, stopping, reloaded, reloader };
};

const fakeDeployer = () => {
  const deployed: Array<{ output: BuildOutput; server: string }> = [];
  const deployer: ContainerDeployer = {
    async deploy(build, server) {
      deployed.push({ output: build, server });
      return { name: build.manifest.name, directory: `${server}/${build.manifest.name}` };
    },
  };
  return { deployer, deployed };
};

test("an existing server is deployed to, reloaded once, then reloaded on save", async () => {
  const timers = new ManualTimers();
  const recorded = fakeServers(false);
  const deployment = fakeDeployer();
  const build = fakeSession();
  const controller = new AbortController();
  const logs: string[] = [];

  const running = runDev(
    { root: "/plugin", serverDirectory: "/existing", debounceMs: 50, signal: controller.signal },
    {
      build: build.factory,
      servers: recorded.servers,
      deployer: deployment.deployer,
      timers,
      log: (line) => logs.push(line),
    },
  );

  await waitFor(() => recorded.events.includes("start"));
  await waitFor(() => recorded.reloaded.length === 1);

  build.emit({ ok: true, output });
  timers.advance(50);
  await waitFor(() => recorded.reloaded.length === 2);

  controller.abort();
  await running;

  expect(recorded.events).toEqual(["prepare", "start", "reload:hello", "reload:hello", "stop"]);
  expect(deployment.deployed.map((entry) => entry.server)).toEqual(["/existing", "/existing"]);
  expect(build.closed).toEqual([true]);
  expect(recorded.stopping).toEqual([true]);
  expect(logs.join("\n")).toMatch(/scoped reload/);
});

test("a managed server loads the first deploy at boot and only reloads on save", async () => {
  const timers = new ManualTimers();
  const recorded = fakeServers(true);
  const deployment = fakeDeployer();
  const build = fakeSession();
  const controller = new AbortController();

  const running = runDev(
    { root: "/plugin", debounceMs: 25, signal: controller.signal },
    {
      build: build.factory,
      servers: recorded.servers,
      deployer: deployment.deployer,
      timers,
      log: () => {},
    },
  );

  await waitFor(() => recorded.events.includes("start"));
  expect(recorded.reloaded).toEqual([]);

  build.emit({ ok: true, output });
  timers.advance(25);
  await waitFor(() => recorded.reloaded.length === 1);

  controller.abort();
  await running;

  expect(recorded.events).toEqual(["prepare", "start", "reload:hello", "stop"]);
});

test("a rebuild that lands while the server boots is not lost", async () => {
  const timers = new ManualTimers();
  const recorded = fakeServers(true);
  const deployment = fakeDeployer();
  const build = fakeSession();
  const controller = new AbortController();

  const servers: ServerHost = {
    prepare: (options) => recorded.servers.prepare(options),
    async start(target) {
      build.emit({ ok: true, output });
      return recorded.servers.start(target);
    },
  };

  const running = runDev(
    { root: "/plugin", debounceMs: 25, signal: controller.signal },
    {
      build: build.factory,
      servers,
      deployer: deployment.deployer,
      timers,
      log: () => {},
    },
  );

  await waitFor(() => recorded.events.includes("start"));
  timers.advance(25);
  await waitFor(() => recorded.reloaded.length === 1);

  controller.abort();
  await running;

  expect(recorded.reloaded).toEqual(["hello"]);
  expect(deployment.deployed).toHaveLength(2);
});

test("a missing RCON configuration stops before building", async () => {
  const build = fakeSession();
  const failingServers: ServerHost = {
    async prepare() {
      throw new Error("RCON is not enabled");
    },
    async start(): Promise<RunningServer> {
      throw new Error("unreachable");
    },
  };
  const deployment = fakeDeployer();

  await expect(
    runDev(
      { root: "/plugin", serverDirectory: "/existing", signal: new AbortController().signal },
      {
        build: build.factory,
        servers: failingServers,
        deployer: deployment.deployer,
        timers: new ManualTimers(),
        log: () => {},
      },
    ),
  ).rejects.toThrow(/RCON is not enabled/);

  expect(deployment.deployed).toEqual([]);
});

test("an initial build failure closes the session without starting the server", async () => {
  const closed: boolean[] = [];
  const failingSession: BuildSession = {
    first: Promise.resolve({ ok: false, error: new Error("type error") }),
    onBuild() {
      return () => {};
    },
    async close() {
      closed.push(true);
    },
  };
  const factory: BuildSessionFactory = {
    async start() {
      return failingSession;
    },
  };
  const recorded = fakeServers(true);
  const deployment = fakeDeployer();

  await expect(
    runDev(
      { root: "/plugin", signal: new AbortController().signal },
      {
        build: factory,
        servers: recorded.servers,
        deployer: deployment.deployer,
        timers: new ManualTimers(),
        log: () => {},
      },
    ),
  ).rejects.toThrow(/type error/);

  expect(recorded.events).toEqual(["prepare"]);
  expect(deployment.deployed).toEqual([]);
  expect(closed).toEqual([true]);
});
