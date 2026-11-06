import { Cause, Duration, Effect, Exit, Fiber, Layer, ManagedRuntime, Option, Scope } from "effect";
import { RuntimeStateError, type RuntimeState } from "./errors";
import { Observability } from "./observability";
import { type Plugin, type RuntimeServices } from "./plugin";
import { makeRegistry, type RegistryService, Registry } from "./registry";

export interface PluginRuntimeOptions {
  /**
   * Development runtimes watch for a program that does not complete and warn.
   * Defaults to `NODE_ENV` being `development` or `test`; hosts may opt in.
   */
  readonly development?: boolean;
  /** How long a development runtime waits before warning. Default: 5 seconds. */
  readonly programTimeout?: Duration.Input;
  /** Replaces the default console observability layer. */
  readonly observability?: Layer.Layer<Observability, never, never>;
}

type RuntimeContext<R> = Exclude<RuntimeServices, Scope.Scope> | R;

const DEFAULT_PROGRAM_TIMEOUT: Duration.Input = "5 seconds";

const isDevelopmentEnvironment = (): boolean => {
  const runtimeProcess = (
    globalThis as {
      readonly process?: { readonly env?: Record<string, string | undefined> };
    }
  ).process;
  const environment = runtimeProcess?.env?.NODE_ENV;
  return environment === "development" || environment === "test";
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
  private disposePromise: Promise<void> | undefined;
  private cleanedUp = false;

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
   * hanging when the program never completes; the program keeps running so
   * late registrations are not silently lost.
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

    this.setState("starting");

    const runtimeLayer = Layer.merge(
      this.plugin.layer,
      Layer.merge(Layer.succeed(Registry, this.registry), this.observability),
    );

    try {
      const managed = ManagedRuntime.make(runtimeLayer);
      this.managed = managed;
      await managed.runPromise(this.startEffect());
      if (!this.disposed) {
        this.setState("running");
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState("failed");
      }
      await this.disposeResources().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Closes the program scope, empties the Registry, and disposes the Layer
   * runtime. Calling it again is a no-op; the runtime never starts again.
   */
  dispose(): Promise<void> {
    if (this.disposePromise !== undefined) {
      return this.disposePromise;
    }
    if (this.state === "disposed") {
      return Promise.resolve();
    }

    this.setState("disposed");
    this.disposePromise = this.disposeResources();
    return this.disposePromise;
  }

  private setState(state: RuntimeState): void {
    this.state = state;
  }

  private startEffect(): Effect.Effect<void, E, RuntimeContext<R>> {
    const { development, plugin, programTimeout } = this;

    const runProgram = Effect.gen(function* () {
      const fiber = yield* Effect.forkScoped(plugin.program);

      if (!development) {
        yield* Fiber.join(fiber);
        return;
      }

      const result = yield* Fiber.join(fiber).pipe(Effect.timeoutOption(programTimeout));
      if (Option.isNone(result)) {
        yield* Observability.use((observability) =>
          observability.log(
            "warning",
            `Plugin '${plugin.name}' program did not complete; a program must be finite.`,
          ),
        );
      }
    });

    return Scope.provide(this.scope)(runProgram);
  }

  private async disposeResources(): Promise<void> {
    if (this.cleanedUp) {
      return;
    }
    this.cleanedUp = true;

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
