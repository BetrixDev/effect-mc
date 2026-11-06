import { Duration, Effect, Fiber, Layer, ManagedRuntime, Option, Scope } from "effect";
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

const isDevelopmentEnvironment = (): boolean =>
  typeof process !== "undefined" &&
  (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");

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

  private readonly development: boolean;
  private readonly programTimeout: Duration.Input;
  private readonly observability: Layer.Layer<Observability, never, never>;

  private managed: ManagedRuntime.ManagedRuntime<RuntimeContext<R>, E> | undefined;
  private state: RuntimeState = "idle";
  private teardownPromise: Promise<void> | undefined;

  private constructor(plugin: Plugin<R, E>, options: PluginRuntimeOptions) {
    this.plugin = plugin;
    this.registry = makeRegistry();
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
        message: `Plugin '${this.plugin.name}' runtime cannot start from state '${this.state}'; a disposed runtime must be recreated`,
      });
    }

    this.state = "starting";

    const runtimeLayer = Layer.merge(
      this.plugin.layer,
      Layer.merge(Layer.succeed(Registry, this.registry), this.observability),
    );

    try {
      const managed = ManagedRuntime.make(runtimeLayer);
      this.managed = managed;
      await managed.runPromise(this.startEffect(managed.scope));
      if (!this.disposed) {
        this.state = "running";
      }
    } catch (error) {
      if (!this.disposed) {
        this.state = "failed";
      }
      await this.teardown();
      throw error;
    }
  }

  /**
   * Closes the runtime scope, empties the Registry, and disposes the Layer
   * runtime. Calling it again is a no-op; the runtime never starts again.
   */
  dispose(): Promise<void> {
    this.state = "disposed";
    return this.teardown();
  }

  private startEffect(scope: Scope.Closeable): Effect.Effect<void, E, RuntimeContext<R>> {
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

    return Scope.provide(scope)(runProgram);
  }

  private teardown(): Promise<void> {
    this.teardownPromise ??= this.disposeResources();
    return this.teardownPromise;
  }

  private async disposeResources(): Promise<void> {
    const managed = this.managed;
    this.managed = undefined;

    try {
      if (managed !== undefined) {
        await managed.dispose();
      }
    } finally {
      this.registry.clear();
    }
  }
}
