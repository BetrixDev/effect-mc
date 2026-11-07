import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import type { PaperDownloader } from "./paper";
import type { ManagedProcess, ProcessExit, ProcessFactory } from "./process";
import type { RconConnection, RconSettings } from "./rcon";
import { PaperServerHost, type ServerOptions } from "./server-host";

const temporaryDirectory = (prefix: string) => mkdtemp(join(tmpdir(), prefix));

const writeExistingServer = async (settings: string): Promise<string> => {
  const directory = await temporaryDirectory("effectmc-server-");
  await writeFile(join(directory, "server.properties"), settings);
  await mkdir(join(directory, "plugins"), { recursive: true });
  await writeFile(join(directory, "plugins", "effectmc-host.jar"), "host");
  return directory;
};

const options = (projectRoot: string, overrides: Partial<ServerOptions> = {}): ServerOptions => ({
  projectRoot,
  paperVersion: "1.21.8",
  rconPort: 25575,
  rconPassword: "dev-secret",
  cacheDirectory: join(projectRoot, ".cache"),
  javaCommand: "java",
  ...overrides,
});

const recorders = () => {
  const downloads: Array<{ version: string; cache: string }> = [];
  const downloader: PaperDownloader = {
    async ensure(version, cache) {
      downloads.push({ version, cache });
      return join(cache, "paper.jar");
    },
  };

  const connections: RconSettings[] = [];
  const commands: string[] = [];
  const closed: boolean[] = [];
  const connection: RconConnection = {
    async command(command) {
      commands.push(command);
      return "";
    },
    async close() {
      closed.push(true);
    },
  };
  const connector = {
    async connect(settings: RconSettings) {
      connections.push(settings);
      return connection;
    },
  };

  return { downloader, downloads, connector, connections, connection, commands, closed };
};

class FakeProcess implements ManagedProcess {
  readonly exited: Promise<ProcessExit>;
  readonly lines: string[] = [];
  readonly killed: boolean[] = [];
  readonly #listeners = new Set<(line: string) => void>();
  #resolveExit!: (exit: ProcessExit) => void;

  constructor(private readonly announceReady: boolean) {
    this.exited = new Promise((resolve) => {
      this.#resolveExit = resolve;
    });
    if (announceReady) {
      queueMicrotask(() => this.emit('Done (1.234s)! For help, type "help"'));
    }
  }

  onLine(listener: (line: string) => void): () => void {
    for (const line of this.lines) listener(line);
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(line: string): void {
    this.lines.push(line);
    for (const listener of this.#listeners) listener(line);
  }

  exit(code: number | null): void {
    this.#resolveExit({ code, signal: null });
  }

  async kill(): Promise<void> {
    if (this.killed.length > 0) {
      return;
    }
    this.killed.push(true);
    this.exit(null);
  }
}

const processFactory = (process: FakeProcess, spawned: string[][]) => {
  const factory: ProcessFactory = {
    spawn(command, args) {
      spawned.push([command, ...args]);
      return process;
    },
  };
  return factory;
};

test("prepares a managed server with EULA, RCON, the host jar, and one Paper download", async () => {
  const projectRoot = await temporaryDirectory("effectmc-project-");
  const hostJar = join(projectRoot, "effectmc-host.jar");
  await writeFile(hostJar, "host-bytes");
  const recorded = recorders();

  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(new FakeProcess(false), []),
    rcon: recorded.connector,
  });

  const target = await host.prepare(options(projectRoot, { hostJar }));

  expect(target.managed).toBe(true);
  expect(target.directory).toBe(join(projectRoot, ".effectmc", "server"));
  expect(target.rcon).toEqual({ host: "127.0.0.1", port: 25575, password: "dev-secret" });
  expect(recorded.downloads).toEqual([{ version: "1.21.8", cache: join(projectRoot, ".cache") }]);

  const serverDirectory = target.directory;
  expect(await readFile(join(serverDirectory, "eula.txt"), "utf8")).toContain("eula=true");
  expect(await readFile(join(serverDirectory, "server.properties"), "utf8")).toContain(
    "enable-rcon=true",
  );
  expect(await readFile(join(serverDirectory, "plugins", "effectmc-host.jar"), "utf8")).toBe(
    "host-bytes",
  );
});

test("starts the managed server, waits for Done, and stops it through RCON", async () => {
  const projectRoot = await temporaryDirectory("effectmc-project-");
  const hostJar = join(projectRoot, "effectmc-host.jar");
  await writeFile(hostJar, "host-bytes");
  const recorded = recorders();
  const process = new FakeProcess(true);
  const spawned: string[][] = [];

  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(process, spawned),
    rcon: recorded.connector,
    readyTimeoutMs: 1_000,
    stopTimeoutMs: 5,
  });

  const target = await host.prepare(options(projectRoot, { hostJar }));
  const running = await host.start(target);

  expect(spawned).toHaveLength(1);
  expect(spawned[0]).toEqual(["java", "-jar", join(projectRoot, ".cache", "paper.jar"), "nogui"]);
  expect(recorded.connections).toEqual([
    { host: "127.0.0.1", port: 25575, password: "dev-secret" },
  ]);

  await running.stop();

  expect(recorded.commands).toEqual(["stop"]);
  expect(recorded.closed).toEqual([true]);
});

test("attaches to an existing server without downloading or spawning", async () => {
  const directory = await writeExistingServer(
    "enable-rcon=true\nrcon.port=25580\nrcon.password=existing\n",
  );
  const recorded = recorders();
  const process = new FakeProcess(false);
  const spawned: string[][] = [];

  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(process, spawned),
    rcon: recorded.connector,
  });

  const target = await host.prepare(options(directory, { serverDirectory: directory }));
  const running = await host.start(target);

  expect(target.managed).toBe(false);
  expect(target.directory).toBe(directory);
  expect(recorded.downloads).toEqual([]);
  expect(recorded.connections).toEqual([{ host: "127.0.0.1", port: 25580, password: "existing" }]);

  await running.reloader.reload("hello");
  expect(recorded.commands).toEqual(["effectmc reload hello"]);

  await running.stop();
  expect(spawned).toEqual([]);
  expect(recorded.closed).toEqual([true]);
});

test("fails before connecting when the existing server has no RCON configuration", async () => {
  const directory = await writeExistingServer("enable-rcon=false\n");
  const recorded = recorders();
  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(new FakeProcess(false), []),
    rcon: recorded.connector,
  });

  await expect(host.prepare(options(directory, { serverDirectory: directory }))).rejects.toThrow(
    /enable-rcon=true/,
  );
  expect(recorded.connections).toEqual([]);
});

test("fails with an instruction when the existing server has no host jar", async () => {
  const directory = await temporaryDirectory("effectmc-server-");
  await writeFile(
    join(directory, "server.properties"),
    "enable-rcon=true\nrcon.port=25575\nrcon.password=secret\n",
  );
  const recorded = recorders();
  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(new FakeProcess(false), []),
    rcon: recorded.connector,
  });

  await expect(host.prepare(options(directory, { serverDirectory: directory }))).rejects.toThrow(
    /effectmc-host\.jar/,
  );
});

test("says why a managed server died before it finished starting", async () => {
  const projectRoot = await temporaryDirectory("effectmc-project-");
  const hostJar = join(projectRoot, "effectmc-host.jar");
  await writeFile(hostJar, "host");
  const recorded = recorders();
  const process = new FakeProcess(false);

  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(process, []),
    rcon: recorded.connector,
    readyTimeoutMs: 1_000,
  });
  const target = await host.prepare(options(projectRoot, { hostJar }));

  const starting = host.start(target);
  await Promise.resolve();
  process.emit("Failed to load eula");
  process.exit(1);

  await expect(starting).rejects.toThrow(/Failed to load eula/);
  expect(recorded.connections).toEqual([]);
});

test("an interrupt during boot stops the managed server", async () => {
  const projectRoot = await temporaryDirectory("effectmc-project-");
  const hostJar = join(projectRoot, "effectmc-host.jar");
  await writeFile(hostJar, "host");
  const recorded = recorders();
  const process = new FakeProcess(false);
  const controller = new AbortController();

  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(process, []),
    rcon: recorded.connector,
    readyTimeoutMs: 1_000,
  });
  const target = await host.prepare(options(projectRoot, { hostJar }));

  const starting = host.start(target, controller.signal);
  controller.abort();

  await expect(starting).rejects.toThrow(/interrupted/);
  expect(process.killed).toEqual([true]);
});

test("times out waiting for a managed server with the log tail", async () => {
  const projectRoot = await temporaryDirectory("effectmc-project-");
  const hostJar = join(projectRoot, "effectmc-host.jar");
  await writeFile(hostJar, "host");
  const recorded = recorders();
  const process = new FakeProcess(false);

  const host = new PaperServerHost({
    downloader: recorded.downloader,
    processes: processFactory(process, []),
    rcon: recorded.connector,
    readyTimeoutMs: 10,
  });
  const target = await host.prepare(options(projectRoot, { hostJar }));
  const starting = host.start(target);
  process.emit("Loading libraries, please wait");

  await expect(starting).rejects.toThrow(/Loading libraries, please wait/);
  expect(process.killed).toEqual([true]);
});
