import { Cause, Duration, Effect, Exit, Layer, ManagedRuntime, Option, Scope } from "effect";
import { RuntimeStateError, type RuntimeState } from "./errors";
import { Observability } from "./observability";
import type { Plugin } from "./plugin";
import { makeRegistry, type RegistryService, Registry, registryLayer } from "./registry";

export interface PluginRuntimeOptions {
  /**
   * Development runtimes bound the program and warn when it does not finish.
   * Defaults to `NODE_ENV !== "production"`.
   */
  readonly development?: boolean;
  /** How long a development runtime waits before warning. Default: 5 seconds. */
  readonly programTimeout?: Duration.Input;
  /** Replaces the default console observability layer. */
  readonly observability?: Layer.Layer<Observability, never, never>;
}

type RuntimeContext<R> = R | Registry | Observability;

const DEFAULT_PROGRAM_TIMEOUT: Duration.Input = "5 seconds";

const isDevelopmentEnvironment = (): boolean => {
  const runtimeProcess = (
    globalThis as {
      readonly process?: { readonly env?: Record<string, string | undefined> };
    }
  ).process;
  return runtimeProcess?.env?.NODE_ENV !== "production";
};

/**
 * One started plugin: a Layer-backed Effect runtime, the program's scope, and
 * the Registry the program wrote into.
 *
 * Disposal is terminal (the underlying `ManagedRuntime` cannot be reused), so
 * a reload constructs a new `PluginRuntime` from the same `Plugin`.
 */
export class PluginRuntime<R = never, E = never> {
  readonly plugin: Plugin<R, E>;
  readonly registry: RegistryService;

  private readonly scope: Scope.Closeable;
  private readonly development: boolean;
  private readonly programTimeout: Duration.Input;
  private readonly observability: Layer.Layer<Observability, never, never>;

  private managed: ManagedRuntime.ManagedRuntime<RuntimeContext<R>, E> | undefined;
  private state: RuntimeState = "idle";
  private disposal: Promise<void> | undefined;
  private resourcesDisposed = false;

  private constructor(plugin: Plugin<R, E>, options: PluginRuntimeOptions) {
    this.plugin = plugin;
    this.registry = makeRegistry();
    this.scope = Scope.makeUnsafe();
    this.development = options.development ?? isDevelopmentEnvironment();
    this.programTimeout = options.programTimeout ?? DEFAULT_PROGRAM_TIMEOUT;
    this.observability = options.observability ?? Observability.layer;
  }

  static make<R, E>(plugin: Plugin<R, E>, options: PluginRuntimeOptions = {}): PluginRuntime<R, E> {
    return new PluginRuntime(plugin, options);
  }

  get status(): RuntimeState {
    return this.state;
  }

  get disposed(): boolean {
    return this.state === "disposed";
  }

  /**
   * Builds the runtime, runs the program to completion, and leaves attach
   * fibers alive in the runtime scope. A development runtime warns instead of
   * hanging when the program never completes.
   */
  async start(): Promise<void> {
    if (this.state !== "idle") {
      throw new RuntimeStateError({
        plugin: this.plugin.name,
        state: this.state,
        message:
          this.state === "disposed"
            ? `Plugin '${this.plugin.name}' runtime is disposed; create a new runtime to restart it`
            : `Plugin '${this.plugin.name}' runtime cannot start from state '${this.state}'`,
      });
    }

    this.state = "starting";

    const runtimeLayer = Layer.merge(
      this.plugin.layer,
      Layer.merge(registryLayer(this.registry), this.observability),
    );

    try {
      const managed = ManagedRuntime.make(runtimeLayer);
      this.managed = managed;
      await managed.runPromise(this.startEffect());
      this.state = "running";
    } catch (error) {
      this.state = "failed";
      await this.disposeResources().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Closes the program scope, empties the Registry, and disposes the Layer
   * runtime. Calling it again is a no-op; the runtime never starts again.
   */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) {
      return this.disposal;
    }
    if (this.state === "disposed") {
      return Promise.resolve();
    }
    if (this.state === "starting") {
      return Promise.reject(
        new RuntimeStateError({
          plugin: this.plugin.name,
          state: this.state,
          message: `Plugin '${this.plugin.name}' runtime cannot be disposed while it is starting`,
        }),
      );
    }

    this.state = "disposed";
    this.disposal = this.disposeResources();
    return this.disposal;
  }

  private startEffect(): Effect.Effect<void, E, RuntimeContext<R>> {
    const program = Scope.provide(this.scope)(this.plugin.program);

    if (!this.development) {
      return program;
    }

    return program.pipe(
      Effect.timeoutOption(this.programTimeout),
      Effect.flatMap((result) =>
        Option.isNone(result)
          ? Observability.use((observability) =>
              observability.log(
                "warning",
                `Plugin '${this.plugin.name}' program did not complete; a program must be finite.`,
              ),
            ).pipe(Effect.asVoid)
          : Effect.void,
      ),
    );
  }

  private async disposeResources(): Promise<void> {
    if (this.resourcesDisposed) {
      return;
    }
    this.resourcesDisposed = true;

    const closeExit = await Effect.runPromiseExit(Scope.close(this.scope, Exit.void));
    this.registry.clear();

    const managed = this.managed;
    this.managed = undefined;
    if (managed !== undefined) {
      await managed.dispose();
    }

    if (Exit.isFailure(closeExit)) {
      throw Cause.squash(closeExit.cause);
    }
  }
}
