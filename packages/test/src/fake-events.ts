import { makeEventBus, type EventBusService } from "@effectmc/core";

/** The in-memory event bus `@effectmc/core` already uses for tests. */
export type FakeEventBus = EventBusService;

/**
 * Creates an empty in-memory event bus. Dispatch through it exactly as the
 * Paper host would: `bus.dispatch(SomeEvent, event)`.
 */
export const makeFakeEventBus = (): FakeEventBus => makeEventBus();
