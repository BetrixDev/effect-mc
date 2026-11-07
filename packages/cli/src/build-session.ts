import { resolve } from "node:path";
import { resolveConfig, build as viteBuild } from "vite";
import { EFFECTMC_PLUGIN_NAME, readContainerManifest } from "@effectmc/vite";
import type { BuildOutput } from "./container";
import { formatError, type Logger } from "./log";

export type BuildResult =
  | { readonly ok: true; readonly output: BuildOutput }
  | { readonly ok: false; readonly error: Error };

/** A running build: the first result plus every rebuild after it. */
export interface BuildSession {
  /** Resolves after the first build attempt, success or failure. */
  readonly first: Promise<BuildResult>;
  /** Subscribes to rebuilds. Returns an unsubscribe function. */
  onBuild(listener: (result: BuildResult) => void): () => void;
  close(): Promise<void>;
}

export interface BuildSessionOptions {
  readonly root: string;
  readonly mode?: string;
  readonly logLevel?: "info" | "warn" | "error" | "silent";
  readonly log?: Logger;
}

export interface BuildSessionFactory {
  start(options: BuildSessionOptions): Promise<BuildSession>;
}

interface WatchEvent {
  readonly code: string;
  readonly error?: unknown;
}

interface WatchSession {
  on(event: "event", listener: (event: WatchEvent) => void): void;
  close(): Promise<void>;
}

/**
 * Starts Vite in watch mode. The author's `vite.config.ts` supplies the
 * `@effectmc/vite` plugin; the loop only needs to know when a build finished.
 */
export class ViteBuildSessionFactory implements BuildSessionFactory {
  async start(options: BuildSessionOptions): Promise<BuildSession> {
    const mode = options.mode ?? "development";
    const resolved = await resolveConfig({ root: options.root, mode }, "build");
    if (!resolved.plugins.some((plugin) => plugin.name === EFFECTMC_PLUGIN_NAME)) {
      throw new Error(
        `The Vite config for ${options.root} does not include the EffectMC plugin. ` +
          "Add effectmc() from @effectmc/vite to the plugins array.",
      );
    }

    const result = await viteBuild({
      root: options.root,
      mode,
      logLevel: options.logLevel ?? "info",
      build: { watch: {} },
    });
    const watcher = result as unknown as WatchSession;
    if (typeof watcher.on !== "function") {
      throw new Error("Vite did not start a watch build. Check the Vite config and try again.");
    }

    const outDir = resolve(options.root, resolved.build.outDir);
    let firstSettled = false;
    let closed = false;
    let resolveFirst!: (value: BuildResult) => void;
    const first = new Promise<BuildResult>((resolve) => {
      resolveFirst = resolve;
    });
    const listeners = new Set<(result: BuildResult) => void>();

    const settle = (value: BuildResult): void => {
      if (!firstSettled) {
        firstSettled = true;
        resolveFirst(value);
        return;
      }
      if (!closed) {
        for (const listener of listeners) listener(value);
      }
    };

    const finish = (): void => {
      try {
        settle({
          ok: true,
          output: { outDir, manifest: readContainerManifest(outDir) },
        });
      } catch (error) {
        settle({ ok: false, error: toError(error) });
      }
    };

    watcher.on("event", (event) => {
      if (event.code === "END") {
        finish();
      } else if (event.code === "ERROR") {
        settle({ ok: false, error: toError(event.error) });
        options.log?.(`Build failed: ${formatError(event.error)}`);
      }
    });

    return {
      first,
      onBuild(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async close() {
        closed = true;
        listeners.clear();
        await watcher.close();
      },
    };
  }
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(formatError(value));
}
