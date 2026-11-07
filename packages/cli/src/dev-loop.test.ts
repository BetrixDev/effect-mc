import { expect, test } from "vite-plus/test";
import type { BuildResult, BuildSession } from "./build-session";
import type { ContainerDeployer, DeployedContainer } from "./container";
import { DevLoop } from "./dev-loop";
import type { ScopedReloader } from "./server/rcon";
import { ManualTimers } from "./test-support/manual-timers";

const output = (name: string) => ({
  outDir: `/build/${name}`,
  manifest: { name, version: "0.1.0", entry: "plugin.mjs" as const },
});

const recorders = () => {
  const deployed: Array<{ output: ReturnType<typeof output>; server: string }> = [];
  const reloaded: string[] = [];
  const logs: string[] = [];
  const deployer: ContainerDeployer = {
    async deploy(build, server): Promise<DeployedContainer> {
      deployed.push({ output: build as ReturnType<typeof output>, server });
      return { name: build.manifest.name, directory: `${server}/${build.manifest.name}` };
    },
  };
  const reloader: ScopedReloader = {
    async reload(name) {
      reloaded.push(name);
    },
  };
  return { deployed, reloaded, logs, deployer, reloader };
};

const session = () => {
  const listeners = new Set<(result: BuildResult) => void>();
  const build: BuildSession = {
    first: Promise.resolve({ ok: true, output: output("first") }),
    onBuild(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {},
  };
  return {
    build,
    emit(result: BuildResult) {
      for (const listener of listeners) listener(result);
    },
  };
};

test("deploys and reloads one build", async () => {
  const timers = new ManualTimers();
  const recorded = recorders();
  const loop = new DevLoop({
    serverDirectory: "/server",
    debounceMs: 150,
    timers,
    deployer: recorded.deployer,
    reloader: recorded.reloader,
    log: (line) => recorded.logs.push(line),
  });

  await loop.apply(output("hello"));

  expect(recorded.deployed).toHaveLength(1);
  expect(recorded.reloaded).toEqual(["hello"]);
  expect(recorded.logs.join("\n")).toMatch(/scoped reload/);
});

test("coalesces a burst of rebuilds into the latest build", async () => {
  const timers = new ManualTimers();
  const recorded = recorders();
  const loop = new DevLoop({
    serverDirectory: "/server",
    debounceMs: 150,
    timers,
    deployer: recorded.deployer,
    reloader: recorded.reloader,
  });

  loop.schedule(output("one"));
  timers.advance(100);
  loop.schedule(output("two"));
  timers.advance(100);
  loop.schedule(output("three"));

  expect(recorded.deployed).toHaveLength(0);

  timers.advance(149);
  await loop.idle();
  expect(recorded.deployed).toHaveLength(0);

  timers.advance(1);
  await loop.idle();

  expect(recorded.deployed.map((entry) => entry.output.manifest.name)).toEqual(["three"]);
  expect(recorded.reloaded).toEqual(["three"]);
});

test("runs rebuilds that arrive after the debounce window separately", async () => {
  const timers = new ManualTimers();
  const recorded = recorders();
  const loop = new DevLoop({
    serverDirectory: "/server",
    debounceMs: 100,
    timers,
    deployer: recorded.deployer,
    reloader: recorded.reloader,
  });

  loop.schedule(output("one"));
  timers.advance(100);
  await loop.idle();

  loop.schedule(output("two"));
  timers.advance(100);
  await loop.idle();

  expect(recorded.reloaded).toEqual(["one", "two"]);
});

test("a failed deploy does not reload and the next save recovers", async () => {
  const timers = new ManualTimers();
  const recorded = recorders();
  let fail = true;
  const deployer: ContainerDeployer = {
    async deploy(build, server) {
      if (fail) {
        fail = false;
        throw new Error("disk is full");
      }
      return recorded.deployer.deploy(build, server);
    },
  };
  const loop = new DevLoop({
    serverDirectory: "/server",
    debounceMs: 50,
    timers,
    deployer,
    reloader: recorded.reloader,
    log: (line) => recorded.logs.push(line),
  });

  loop.schedule(output("broken"));
  timers.advance(50);
  await loop.idle();

  expect(recorded.reloaded).toEqual([]);
  expect(recorded.logs.join("\n")).toMatch(/disk is full/);

  loop.schedule(output("fixed"));
  timers.advance(50);
  await loop.idle();

  expect(recorded.reloaded).toEqual(["fixed"]);
});

test("tracks a build session and reports build failures", async () => {
  const timers = new ManualTimers();
  const recorded = recorders();
  const fake = session();
  const loop = new DevLoop({
    serverDirectory: "/server",
    debounceMs: 25,
    timers,
    deployer: recorded.deployer,
    reloader: recorded.reloader,
    log: (line) => recorded.logs.push(line),
  });

  const untrack = loop.track(fake.build);
  fake.emit({ ok: false, error: new Error("type error at src/index.ts:1") });
  expect(recorded.logs.join("\n")).toMatch(/type error at src\/index\.ts:1/);

  fake.emit({ ok: true, output: output("hello") });
  timers.advance(25);
  await loop.idle();
  expect(recorded.reloaded).toEqual(["hello"]);

  untrack();
  fake.emit({ ok: true, output: output("ignored") });
  timers.advance(25);
  await loop.idle();
  expect(recorded.reloaded).toEqual(["hello"]);
});

test("close drops a scheduled rebuild and waits for in-flight work", async () => {
  const timers = new ManualTimers();
  const recorded = recorders();
  const loop = new DevLoop({
    serverDirectory: "/server",
    debounceMs: 100,
    timers,
    deployer: recorded.deployer,
    reloader: recorded.reloader,
  });

  loop.schedule(output("dropped"));
  await loop.close();
  timers.advance(100);
  await loop.idle();

  expect(recorded.deployed).toHaveLength(0);
});
