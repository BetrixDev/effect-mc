import {
  type EventBusService,
  type MainThreadService,
  Observability,
  type PdcPlatformService,
  type Plugin,
  PluginRuntime,
  TickClock,
  type WorkerService,
} from "@effectmc/core";
import { Duration, Effect, Layer } from "effect";
import { LeakedRegistrations, ProgramDidNotComplete } from "./errors";
import { makeFakePdc, makeFakePdcPlatform, type FakePdc } from "./fake-pdc";
import { makeFakeRegistry, type FakeRegistry } from "./fake-registry";
import { makeFakeSender, type FakeSender } from "./fake-sender";
import { FakeScheduler } from "./fake-scheduler";

const DEFAULT_PROGRAM_TIMEOUT: Duration.Input = "1 second";

const silentObservability = Layer.succeed(Observability, {
  log: () => Effect.void,
});

export interface TestHarnessOptions {
  /**
   * Wall-clock deadline for the program to complete. Unlike the runtime's
   * development warning, the harness fails the test when the deadline passes.
   * Defaults to one second.
   */
  readonly programTimeout?: Duration.Input;
  /**
   * Enables the runtime's development checks, such as event threading.
   * Defaults to the runtime's own environment check.
   */
  readonly development?: boolean;
  /** Replaces the harness's silent observability layer. */
  readonly observability?: Layer.Layer<Observability, never, never>;
  /** Replaces the inline `Main` hop. Useful for asserting hop targets. */
  readonly mainThread?: MainThreadService;
  /** Replaces the inline worker behind `Paper.offload`. */
  readonly worker?: WorkerService;
  /** Replaces the Java `Pdc` seam. Defaults to structural keys and markers. */
  readonly pdcPlatform?: PdcPlatformService;
}

/**
 * Runs one plugin program against fakes and keeps the Registry available for
 * assertions. It owns the same wiring the Paper host uses, so teardown follows
 * the production path rather than a separate test-only path (ADR-0021).
 */
export class TestHarness<R = never, E = never> {
  readonly plugin: Plugin<R, E>;
  readonly runtime: PluginRuntime<R, E>;
  readonly registry: FakeRegistry;
  readonly clock: TickClock;
  readonly scheduler: FakeScheduler;
  readonly sender: FakeSender;
  readonly pdc: FakePdc;
  readonly pdcPlatform: PdcPlatformService;

  private readonly programTimeoutMillis: number;
  private started = false;

  private constructor(plugin: Plugin<R, E>, options: TestHarnessOptions) {
    this.plugin = plugin;

    const timeoutMillis = Duration.toMillis(options.programTimeout ?? DEFAULT_PROGRAM_TIMEOUT);
    if (Number.isNaN(timeoutMillis) || timeoutMillis < 0) {
      throw new RangeError("programTimeout must be a non-negative duration");
    }
    this.programTimeoutMillis = timeoutMillis;

    this.registry = makeFakeRegistry();
    this.clock = new TickClock();
    this.scheduler = new FakeScheduler(this.clock);
    this.sender = makeFakeSender();
    this.pdc = makeFakePdc();
    this.pdcPlatform = options.pdcPlatform ?? makeFakePdcPlatform();

    this.runtime = PluginRuntime.make(plugin, {
      development: options.development,
      observability: options.observability ?? silentObservability,
      clock: this.clock,
      registry: this.registry,
      mainThread: options.mainThread,
      worker: options.worker,
      pdcPlatform: this.pdcPlatform,
      sender: {
        name: this.sender.name,
        send: this.sender.send,
      },
    });
  }

  static make<R, E>(plugin: Plugin<R, E>, options: TestHarnessOptions = {}): TestHarness<R, E> {
    return new TestHarness(plugin, options);
  }

  /**
   * The in-memory event bus the runtime created. The runtime owns it so the
   * harness inherits the same development policy as production wiring; a
   * supplied bus would otherwise silently opt out of the threading check.
   */
  get events(): EventBusService {
    return this.runtime.eventBus;
  }

  /**
   * Runs the program to completion. If it is still running at the deadline,
   * the runtime is disposed and a `ProgramDidNotComplete` error is thrown
   * rather than leaving the test to hang.
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error(`TestHarness for plugin '${this.plugin.name}' can only start once.`);
    }
    this.started = true;

    const starting = this.runtime.start();
    // The deadline path disposes the runtime; start may reject afterwards.
    starting.catch(() => undefined);

    const deadline = this.deadline();
    try {
      await (deadline === undefined ? starting : Promise.race([starting, deadline.promise]));
    } catch (error) {
      if (error instanceof ProgramDidNotComplete) {
        await this.runtime.dispose();
      }
      throw error;
    } finally {
      deadline?.clear();
    }
  }

  /** Advances server time and lets the woken work run. */
  async advance(ticks = 1): Promise<void> {
    await this.scheduler.advance(ticks);
  }

  /**
   * Disposes the runtime and asserts that teardown detached everything. A
   * plugin that leaves a registration behind fails here instead of appearing
   * healthy until the reload leak spike.
   */
  async teardown(): Promise<void> {
    await this.runtime.dispose();

    // Entries still present now were added after the runtime cleared the
    // Registry, so they are leaks too.
    const leaked = [...this.registry.leaked(), ...this.registry.entries()];
    if (leaked.length === 0) {
      return;
    }

    const entries = leaked.map((registration) => `${registration.kind}:${registration.name}`);
    throw new LeakedRegistrations({
      plugin: this.plugin.name,
      registrations: leaked,
      message:
        `Plugin '${this.plugin.name}' leaked ${leaked.length} registration` +
        `${leaked.length === 1 ? "" : "s"} past teardown: ${entries.join(", ")}. ` +
        "Attach registrations through a scoped verb so they detach with the runtime.",
    });
  }

  private deadline(): { readonly promise: Promise<never>; readonly clear: () => void } | undefined {
    if (!Number.isFinite(this.programTimeoutMillis)) {
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new ProgramDidNotComplete({
            plugin: this.plugin.name,
            timeoutMillis: this.programTimeoutMillis,
            message:
              `Plugin '${this.plugin.name}' program did not complete within ` +
              `${this.programTimeoutMillis}ms; a program must be finite.`,
          }),
        );
      }, this.programTimeoutMillis);
    });

    return {
      promise,
      clear: () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      },
    };
  }
}
