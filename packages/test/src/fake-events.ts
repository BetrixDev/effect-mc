import { makeEventBus, type EventBusOptions, type EventBusService } from "@effectmc/core";

/** The in-memory event bus `@effectmc/core` already uses for tests. */
export type FakeEventBus = EventBusService;

/**
 * Creates an empty in-memory event bus. Dispatch through it exactly as the
 * Paper host would: `bus.dispatch(SomeEvent, event)`.
 *
 * Pass `{ development: true }` to get the same loud threading check a
 * development host runs (ADR-0012); the default is the production policy.
 */
export const makeFakeEventBus = (options: EventBusOptions = {}): FakeEventBus =>
  makeEventBus(options);
