/**
 * The clock fake is the production `TickClock`: plugin time only moves when a
 * test calls `advance`, so no sleep waits on a real timer.
 */
export { TickClock as FakeClock } from "@effectmc/core";
