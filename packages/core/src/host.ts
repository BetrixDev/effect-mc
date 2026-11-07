import { TickClock } from "./clock";
import { PluginAlreadyLoaded, PluginNotLoaded, type RuntimeState } from "./errors";
import type { EventBusService } from "./event-bus";
import type { Plugin } from "./plugin";
import { makeRegistry, type RegistryService } from "./registry";
import { PluginRuntime, type PluginRuntimeOptions } from "./runtime";

/**
 * The runtime seams a host shares across every plugin it owns. Each plugin
 * still gets its own Registry and event bus, so neither is an option here;
 * a shared event bus would be cleared by one plugin's teardown and would wipe
 * another plugin's listeners.
 */
export type PluginHostOptions = Omit<PluginRuntimeOptions, "registry" | "eventBus">;

/**
 * The slice of a runtime the host itself needs. Keeping the stored type free
 * of the plugin's `R` and `E` lets the host hold heterogeneous plugins without
 * casts; `start` and `reload` return the fully typed runtime to the caller.
 */
type HostedRuntime = Pick<PluginRuntime<never, never>, "start" | "dispose" | "status" | "eventBus">;

interface HostedPlugin {
  readonly registry: RegistryService;
  readonly runtime: HostedRuntime;
}

const notLoaded = (plugin: string, loaded: ReadonlyArray<string>): PluginNotLoaded =>
  new PluginNotLoaded({
    plugin,
    loaded,
    message:
      `Plugin '${plugin}' is not loaded; a reload rebuilds an existing plugin. ` +
      `Loaded plugins: ${loaded.length === 0 ? "none" : loaded.join(", ")}.`,
  });

/**
 * Starts, reloads, and stops plugin runtimes by name. A reload is the caveated
 * sequence ADR-0017 defines: dispose the runtime, empty its Registry, close the
 * Context, open a new Context, and run the re-evaluated program again. It is a
 * Context rebuild, never module-level hot reload, and not production-safe until
 * the 50× leak spike passes.
 *
 * Each plugin gets its own Registry and event bus, so rebuilding one plugin
 * cannot disturb another. The tick clock and `hostServices`, such as the
 * command registrar, are shared the way a real host shares them.
 *
 * Other plugins keep their runtime, Registry, and command registrations across
 * a reload. Commands are re-registered by running the program again; nothing
 * attempts to unregister them, because the platform offers no such API
 * (ADR-0011).
 *
 * A host dispatches lifecycle calls for one plugin serially, as the Paper host
 * does from the main thread. Do not reload the same plugin concurrently.
 */
export class PluginHost {
  readonly clock: TickClock;

  private readonly runtimeOptions: Omit<PluginRuntimeOptions, "registry" | "eventBus">;
  private readonly hosted = new Map<string, HostedPlugin>();

  private constructor(options: PluginHostOptions) {
    this.clock = options.clock ?? new TickClock();
    this.runtimeOptions = { ...options, clock: this.clock };
  }

  static make(options: PluginHostOptions = {}): PluginHost {
    return new PluginHost(options);
  }

  /**
   * Loads a plugin for the first time. A name may only be started once; use
   * {@link reload} to replace a running plugin.
   */
  async start<R, E>(plugin: Plugin<R, E>): Promise<PluginRuntime<R, E>> {
    if (this.hosted.has(plugin.name)) {
      throw new PluginAlreadyLoaded({
        plugin: plugin.name,
        message: `Plugin '${plugin.name}' is already loaded; reload it instead of starting it again.`,
      });
    }

    const registry = makeRegistry();
    const runtime = this.makeRuntime(plugin, registry);
    this.hosted.set(plugin.name, { registry, runtime });

    try {
      await runtime.start();
    } catch (error) {
      this.hosted.delete(plugin.name);
      throw error;
    }

    return runtime;
  }

  /**
   * Rebuilds one plugin from a freshly evaluated `Plugin` value. The outgoing
   * runtime is disposed first, so its Registry is empty before the new Context
   * opens; the same Registry is then reused for the replacement.
   */
  async reload<R, E>(plugin: Plugin<R, E>): Promise<PluginRuntime<R, E>> {
    const current = this.hosted.get(plugin.name);
    if (current === undefined) {
      throw notLoaded(plugin.name, this.names());
    }

    await current.runtime.dispose();

    const runtime = this.makeRuntime(plugin, current.registry);
    this.hosted.set(plugin.name, { registry: current.registry, runtime });
    await runtime.start();

    return runtime;
  }

  /** Disposes every plugin, newest first, as the Paper host does at shutdown. */
  async dispose(): Promise<void> {
    const hosted = [...this.hosted.values()].reverse();
    this.hosted.clear();

    for (const entry of hosted) {
      await entry.runtime.dispose();
    }
  }

  /** The names currently owned by the host, in start order. */
  names(): ReadonlyArray<string> {
    return [...this.hosted.keys()];
  }

  status(name: string): RuntimeState | undefined {
    return this.hosted.get(name)?.runtime.status;
  }

  /** The Registry the named plugin keeps across reloads. */
  registry(name: string): RegistryService | undefined {
    return this.hosted.get(name)?.registry;
  }

  /** The event bus the named plugin's attachments live on. */
  eventBus(name: string): EventBusService | undefined {
    return this.hosted.get(name)?.runtime.eventBus;
  }

  private makeRuntime<R, E>(plugin: Plugin<R, E>, registry: RegistryService): PluginRuntime<R, E> {
    return PluginRuntime.make(plugin, { ...this.runtimeOptions, registry });
  }
}
