import type { BuildResult, BuildSession } from "./build-session";
import type { BuildOutput, ContainerDeployer, DeployedContainer } from "./container";
import { formatError, type Logger } from "./log";
import type { ScopedReloader } from "./server/rcon";

export type TimerHandle = ReturnType<typeof setTimeout> | number;

/** The timer seam exists so debounce behaviour is testable without sleeping. */
export interface Timers {
  setTimeout(callback: () => void, milliseconds: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const systemTimers: Timers = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface DevLoopOptions {
  readonly serverDirectory: string;
  readonly debounceMs: number;
  readonly deployer: ContainerDeployer;
  readonly reloader: ScopedReloader;
  readonly timers?: Timers;
  readonly log?: Logger;
}

/**
 * Turns build results into the host's scoped reload. Saves are coalesced, and
 * deploys run one at a time so a slow reload cannot apply a stale bundle after
 * a newer one. The reload path is the production teardown path: the host
 * disposes the runtime, empties the Registry, closes the Context, and runs the
 * program again (ADR-0017).
 */
export class DevLoop {
  readonly #serverDirectory: string;
  readonly #debounceMs: number;
  readonly #deployer: ContainerDeployer;
  readonly #reloader: ScopedReloader;
  readonly #timers: Timers;
  readonly #log: Logger;

  #timer: TimerHandle | undefined;
  #pending: BuildOutput | undefined;
  #chain: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(options: DevLoopOptions) {
    this.#serverDirectory = options.serverDirectory;
    this.#debounceMs = options.debounceMs;
    this.#deployer = options.deployer;
    this.#reloader = options.reloader;
    this.#timers = options.timers ?? systemTimers;
    this.#log = options.log ?? (() => {});
  }

  /** Deploys one build and sends `/effectmc reload <name>` over RCON. */
  async apply(output: BuildOutput): Promise<DeployedContainer> {
    const deployed = await this.#deployer.deploy(output, this.#serverDirectory);
    await this.#reloader.reload(deployed.name);
    this.#log(`Deployed ${deployed.name} to ${deployed.directory} and sent a scoped reload.`);
    this.#log("The host rebuilt the plugin's Context; this is not hot module reload.");
    return deployed;
  }

  /** Coalesces a burst of rebuilds into one deploy and reload. */
  schedule(output: BuildOutput): void {
    if (this.#closed) {
      return;
    }

    this.#pending = output;
    if (this.#timer !== undefined) {
      this.#timers.clearTimeout(this.#timer);
    }
    this.#timer = this.#timers.setTimeout(() => {
      this.#timer = undefined;
      const pending = this.#pending;
      this.#pending = undefined;
      if (pending !== undefined) {
        this.#enqueue(pending);
      }
    }, this.#debounceMs);
  }

  /** Subscribes to a build session, logging failures rather than stopping. */
  track(session: BuildSession): () => void {
    return session.onBuild((result: BuildResult) => {
      if (result.ok) {
        this.schedule(result.output);
      } else {
        this.#log(`Build failed: ${result.error.message}`);
      }
    });
  }

  /** Resolves when every apply started so far has finished. */
  idle(): Promise<void> {
    return this.#chain;
  }

  /** Stops accepting work and waits for an in-flight deploy and reload. */
  async close(): Promise<void> {
    this.#closed = true;
    this.#pending = undefined;
    if (this.#timer !== undefined) {
      this.#timers.clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    await this.#chain;
  }

  #enqueue(output: BuildOutput): void {
    this.#chain = this.#chain.then(async () => {
      try {
        await this.apply(output);
      } catch (error) {
        this.#log(`Deploy or reload failed: ${formatError(error)}`);
      }
    });
  }
}
