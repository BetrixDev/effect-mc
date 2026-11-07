import { resolve } from "node:path";
import { ViteBuildSessionFactory, type BuildSessionFactory } from "./build-session";
import { FileContainerDeployer, type BuildOutput, type ContainerDeployer } from "./container";
import { DevLoop, systemTimers, type Timers } from "./dev-loop";
import { consoleLogger, type Logger } from "./log";
import { javaCommand } from "./server/java";
import {
  CachedPaperDownloader,
  DEFAULT_PAPER_VERSION,
  defaultCacheDirectory,
} from "./server/paper";
import { NodeProcessFactory } from "./server/process";
import { NodeRconConnector } from "./server/rcon";
import {
  PaperServerHost,
  type RunningServer,
  type ServerHost,
  type ServerOptions,
} from "./server/server-host";

export interface DevOptions {
  readonly root?: string;
  readonly serverDirectory?: string;
  readonly hostJar?: string;
  readonly javaCommand?: string;
  readonly paperVersion?: string;
  readonly cacheDirectory?: string;
  readonly debounceMs?: number;
  readonly rconPort?: number;
  readonly rconPassword?: string;
  readonly signal?: AbortSignal;
}

export interface DevDependencies {
  readonly build: BuildSessionFactory;
  readonly servers: ServerHost;
  readonly deployer: ContainerDeployer;
  readonly timers: Timers;
  readonly log: Logger;
}

export class ServerExitedError extends Error {
  override readonly name = "ServerExitedError";

  constructor(directory: string, exit: { code: number | null; signal: NodeJS.Signals | null }) {
    const reason = exit.signal === null ? `code ${exit.code}` : `signal ${exit.signal}`;
    super(
      `The managed server at ${directory} exited (${reason}). ` +
        "The dev loop stopped; fix the server problem and run effectmc dev again.",
    );
  }
}

/**
 * One command: build, deploy, and start (or attach to) a server, then rebuild,
 * deploy, and send the host's scoped reload on every save.
 */
export async function runDev(
  options: DevOptions = {},
  overrides: Partial<DevDependencies> = {},
): Promise<void> {
  const log = overrides.log ?? consoleLogger;
  const dependencies: DevDependencies = {
    ...defaultDependencies(log),
    ...overrides,
  };
  const root = resolve(options.root ?? process.cwd());
  assertActive(options.signal);

  const target = await dependencies.servers.prepare(serverOptions(options, root));
  assertActive(options.signal);
  const session = await dependencies.build.start({ root, mode: "development", log });

  // A save can land while the server is booting. Keep the newest rebuild so
  // the loop can apply it as soon as the reloader exists.
  let queued: BuildOutput | undefined;
  let releaseEarly = (): void => {};
  releaseEarly = session.onBuild((result) => {
    if (result.ok) {
      queued = result.output;
    } else {
      log(`Build failed: ${result.error.message}`);
    }
  });

  let running: RunningServer | undefined;
  try {
    const first = await session.first;
    if (!first.ok) {
      throw first.error;
    }
    assertActive(options.signal);

    const deployed = await dependencies.deployer.deploy(first.output, target.directory);
    log(`Deployed ${deployed.name} to ${deployed.directory}.`);
    assertActive(options.signal);
    running = await dependencies.servers.start(target, options.signal);

    const loop = new DevLoop({
      serverDirectory: target.directory,
      debounceMs: options.debounceMs ?? 150,
      deployer: dependencies.deployer,
      reloader: running.reloader,
      timers: dependencies.timers,
      log,
    });

    if (!target.managed) {
      await running.reloader.reload(deployed.name);
      log(
        `Reloaded '${deployed.name}' over RCON. This was a scoped Context rebuild, not hot module reload.`,
      );
    }

    releaseEarly();
    releaseEarly = () => {};
    const untrack = loop.track(session);
    if (queued !== undefined) {
      loop.schedule(queued);
    }

    try {
      await waitForStop(options.signal, running);
    } finally {
      untrack();
      await loop.close();
    }
  } finally {
    releaseEarly();
    if (running !== undefined) {
      await running.stop();
    }
    await session.close();
  }
}

function defaultDependencies(log: Logger): DevDependencies {
  return {
    build: new ViteBuildSessionFactory(),
    servers: new PaperServerHost({
      downloader: new CachedPaperDownloader(fetch, log),
      processes: new NodeProcessFactory(),
      rcon: new NodeRconConnector(),
      log,
    }),
    deployer: new FileContainerDeployer(),
    timers: systemTimers,
    log,
  };
}

function serverOptions(options: DevOptions, root: string): ServerOptions {
  return {
    projectRoot: root,
    serverDirectory:
      options.serverDirectory === undefined ? undefined : resolve(options.serverDirectory),
    hostJar: options.hostJar,
    paperVersion: options.paperVersion ?? DEFAULT_PAPER_VERSION,
    rconPort: options.rconPort ?? 25_575,
    rconPassword: options.rconPassword,
    cacheDirectory: options.cacheDirectory ?? defaultCacheDirectory(),
    javaCommand: javaCommand(options.javaCommand),
    signal: options.signal,
  };
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new Error("effectmc dev was interrupted.");
  }
}

function waitForStop(signal: AbortSignal | undefined, running: RunningServer): Promise<void> {
  return new Promise<void>((resolveStop, rejectStop) => {
    if (signal?.aborted === true) {
      resolveStop();
      return;
    }

    const cleanup = (): void => {
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      cleanup();
      resolveStop();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    running.exited?.then(
      (exit) => {
        cleanup();
        rejectStop(new ServerExitedError(running.directory, exit));
      },
      (error: unknown) => {
        cleanup();
        rejectStop(error);
      },
    );
  });
}
