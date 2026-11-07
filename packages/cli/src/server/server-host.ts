import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "../log";
import type { PaperDownloader } from "./paper";
import { parseServerProperties, readRconSettings, writeServerProperties } from "./properties";
import type { ProcessExit, ProcessFactory } from "./process";
import {
  RconScopedReloader,
  type RconConnection,
  type RconConnector,
  type RconSettings,
  type ScopedReloader,
} from "./rcon";

export interface ServerOptions {
  readonly projectRoot: string;
  readonly serverDirectory?: string;
  readonly hostJar?: string;
  readonly paperVersion: string;
  readonly rconPort: number;
  readonly rconPassword?: string;
  readonly cacheDirectory: string;
  readonly javaCommand: string;
  readonly signal?: AbortSignal;
}

export type ServerTarget =
  | {
      readonly managed: false;
      readonly directory: string;
      readonly rcon: RconSettings;
      readonly javaCommand: string;
    }
  | {
      readonly managed: true;
      readonly directory: string;
      readonly rcon: RconSettings;
      readonly javaCommand: string;
      readonly paperJar: string;
    };

export interface RunningServer {
  readonly directory: string;
  readonly reloader: ScopedReloader;
  /** Resolves when an owned server exits. Absent when attached with --server. */
  readonly exited?: Promise<ProcessExit>;
  stop(): Promise<void>;
}

export interface ServerHost {
  prepare(options: ServerOptions): Promise<ServerTarget>;
  start(target: ServerTarget, signal?: AbortSignal): Promise<RunningServer>;
}

export interface ServerHostDependencies {
  readonly downloader: PaperDownloader;
  readonly processes: ProcessFactory;
  readonly rcon: RconConnector;
  readonly log?: Logger;
  readonly readyTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
  readonly generatePassword?: () => string;
}

/**
 * Owns a managed Paper server, or attaches to an existing one with `--server`.
 * Both modes deploy into the same container root and reload through the same
 * host command (ADR-0016, ADR-0017).
 */
export class PaperServerHost implements ServerHost {
  readonly #downloader: PaperDownloader;
  readonly #processes: ProcessFactory;
  readonly #rcon: RconConnector;
  readonly #log: Logger;
  readonly #readyTimeoutMs: number;
  readonly #stopTimeoutMs: number;
  readonly #generatePassword: () => string;

  constructor(dependencies: ServerHostDependencies) {
    this.#downloader = dependencies.downloader;
    this.#processes = dependencies.processes;
    this.#rcon = dependencies.rcon;
    this.#log = dependencies.log ?? (() => {});
    this.#readyTimeoutMs = dependencies.readyTimeoutMs ?? 120_000;
    this.#stopTimeoutMs = dependencies.stopTimeoutMs ?? 10_000;
    this.#generatePassword =
      dependencies.generatePassword ?? (() => randomBytes(16).toString("hex"));
  }

  async prepare(options: ServerOptions): Promise<ServerTarget> {
    if (options.serverDirectory !== undefined) {
      return this.#prepareExisting(options, resolve(options.serverDirectory));
    }
    return this.#prepareManaged(options);
  }

  async start(target: ServerTarget, signal?: AbortSignal): Promise<RunningServer> {
    if (signal?.aborted === true) {
      throw new Error("effectmc dev was interrupted.");
    }

    if (!target.managed) {
      const connection = await this.#rcon.connect(target.rcon);
      return {
        directory: target.directory,
        reloader: new RconScopedReloader(connection, this.#log),
        async stop() {
          await connection.close();
        },
      };
    }

    const process = this.#processes.spawn(target.javaCommand, ["-jar", target.paperJar, "nogui"], {
      cwd: target.directory,
    });
    process.onLine((line) => this.#log(line));

    try {
      await this.#waitForReady(process, target.directory, signal);
    } catch (error) {
      await process.kill();
      throw error;
    }

    let connection: RconConnection;
    try {
      connection = await this.#rcon.connect(target.rcon);
    } catch (error) {
      await process.kill();
      throw error;
    }

    const stopTimeoutMs = this.#stopTimeoutMs;
    let stopped = false;
    return {
      directory: target.directory,
      reloader: new RconScopedReloader(connection, this.#log),
      exited: process.exited,
      async stop() {
        if (stopped) {
          return;
        }
        stopped = true;

        try {
          await connection.command("stop");
        } catch {
          // The server commonly closes the socket before answering `stop`.
        }

        if (!(await exitWithin(process.exited, stopTimeoutMs))) {
          await process.kill();
        }
        await connection.close();
      },
    };
  }

  #prepareExisting(options: ServerOptions, directory: string): ServerTarget {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(
        `The server directory ${directory} does not exist. ` +
          "Point --server at a Paper installation, or omit --server to let effectmc dev manage one.",
      );
    }

    const rcon = readRconSettings(directory);
    requireInstalledHost(directory);
    return { managed: false, directory, rcon, javaCommand: options.javaCommand };
  }

  async #prepareManaged(options: ServerOptions): Promise<ServerTarget> {
    const directory = join(options.projectRoot, ".effectmc", "server");
    mkdirSync(directory, { recursive: true });

    acceptEula(directory, this.#log);
    const rcon = this.#configureRcon(directory, options);
    this.#installHostJar(directory, options);

    const paperJar = await this.#downloader.ensure(
      options.paperVersion,
      options.cacheDirectory,
      options.signal,
    );
    return {
      managed: true,
      directory,
      rcon,
      javaCommand: options.javaCommand,
      paperJar,
    };
  }

  #configureRcon(directory: string, options: ServerOptions): RconSettings {
    if (!Number.isInteger(options.rconPort) || options.rconPort < 1 || options.rconPort > 65_535) {
      throw new Error(`Invalid RCON port '${options.rconPort}': use a port from 1 to 65535.`);
    }

    const path = join(directory, "server.properties");
    const properties = existsSync(path)
      ? parseServerProperties(readFileSync(path, "utf8"))
      : new Map<string, string>();
    const existingPassword = properties.get("rcon.password")?.trim();
    const password =
      options.rconPassword ?? (existingPassword ? existingPassword : this.#generatePassword());
    if (password.trim().length === 0 || /[\r\n]/.test(password)) {
      throw new Error("The RCON password must not be blank or contain a newline.");
    }

    writeServerProperties(directory, {
      "enable-rcon": "true",
      "rcon.port": String(options.rconPort),
      "rcon.password": password,
    });
    this.#log(`RCON enabled on 127.0.0.1:${options.rconPort}.`);
    return { host: "127.0.0.1", port: options.rconPort, password };
  }

  #installHostJar(directory: string, options: ServerOptions): void {
    const source = resolveHostJar(options);
    const plugins = join(directory, "plugins");
    mkdirSync(plugins, { recursive: true });
    const target = join(plugins, "effectmc-host.jar");
    if (resolve(source) !== resolve(target)) {
      copyFileSync(source, target);
    }
    this.#log(`Installed the EffectMC host jar from ${source}.`);
  }

  #waitForReady(
    process: ReturnType<ProcessFactory["spawn"]>,
    directory: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolveReady, rejectReady) => {
      const history: string[] = [];
      let settled = false;
      let unsubscribe = (): void => {};
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        unsubscribe();
        signal?.removeEventListener("abort", onAbort);
        if (error === undefined) {
          resolveReady();
        } else {
          rejectReady(error);
        }
      };

      const onAbort = (): void => {
        finish(new Error("effectmc dev was interrupted."));
        void process.kill();
      };

      if (signal?.aborted === true) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      timer = setTimeout(() => {
        finish(
          new Error(
            `The managed server at ${directory} did not finish starting within ${this.#readyTimeoutMs} ms. ` +
              `Last output:\n${history.join("\n")}`,
          ),
        );
        void process.kill();
      }, this.#readyTimeoutMs);

      unsubscribe = process.onLine((line) => {
        history.push(line);
        if (history.length > 40) {
          history.shift();
        }
        if (line.includes("Done (")) {
          finish();
        }
      });

      if (settled) {
        unsubscribe();
      }

      void process.exited.then((exit) => {
        finish(
          new Error(
            `The managed server at ${directory} exited before it was ready (code ${exit.code}). ` +
              `Last output:\n${history.join("\n")}`,
          ),
        );
      });
    });
  }
}

function acceptEula(directory: string, log: Logger): void {
  const path = join(directory, "eula.txt");
  const accepted = existsSync(path) && /^eula=true$/im.test(readFileSync(path, "utf8"));
  if (!accepted) {
    writeFileSync(path, "eula=true\n");
    log(`Accepted the Minecraft EULA for the managed server at ${directory}.`);
  }
}

function requireInstalledHost(directory: string): void {
  const plugins = join(directory, "plugins");
  const installed =
    existsSync(plugins) &&
    readdirSync(plugins).some(
      (name) => name.toLowerCase().endsWith(".jar") && name.toLowerCase().includes("effectmc"),
    );
  if (!installed) {
    throw new Error(
      `The server at ${directory} has no EffectMC host jar in plugins/. ` +
        "Install plugins/effectmc-host.jar, or run effectmc dev without --server to let it manage a server.",
    );
  }
}

function resolveHostJar(options: ServerOptions): string {
  const explicit = options.hostJar ?? process.env.EFFECTMC_HOST_JAR;
  if (explicit !== undefined && explicit.length > 0) {
    const path = resolve(explicit);
    if (!existsSync(path)) {
      throw new Error(`The EffectMC host jar ${path} does not exist.`);
    }
    return path;
  }

  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const roots = [options.projectRoot, process.cwd(), packageRoot, join(packageRoot, "..", "..")];
  for (const root of roots) {
    const direct = join(root, "effectmc-host.jar");
    if (existsSync(direct)) {
      return direct;
    }
    const built = findHostJar(join(root, "host", "build", "libs"));
    if (built !== undefined) {
      return built;
    }
  }

  throw new Error(
    "Could not find effectmc-host.jar. " +
      "Build it with `cd host && ./gradlew build`, then pass --host-jar <path> or set EFFECTMC_HOST_JAR.",
  );
}

function findHostJar(directory: string): string | undefined {
  if (!existsSync(directory)) {
    return undefined;
  }
  const jars = readdirSync(directory)
    .filter((name) => /^effectmc-host.*\.jar$/i.test(name) && !/(sources|javadoc)/i.test(name))
    .sort();
  return jars.length === 0 ? undefined : join(directory, jars[0]!);
}

async function exitWithin(exited: Promise<ProcessExit>, milliseconds: number): Promise<boolean> {
  return new Promise<boolean>((resolveExit) => {
    let settled = false;
    const settle = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveExit(value);
    };
    const timer = setTimeout(() => settle(false), milliseconds);
    exited.then(
      () => settle(true),
      () => settle(true),
    );
  });
}
