/**
 * @effectmc/test
 *
 * Fakes for the runtime's seams and a harness that runs a plugin program to
 * completion against them. No Paper installation is involved.
 */
export { LeakedRegistrations, ProgramDidNotComplete } from "./errors";
export { FakeClock } from "./fake-clock";
export { makeFakeEventBus, type FakeEventBus } from "./fake-events";
export { makeFakePdc, type FakePdc, type FakePdcKey } from "./fake-pdc";
export { makeFakeRegistry, type FakeRegistry } from "./fake-registry";
export { makeFakeSender, type FakeSender } from "./fake-sender";
export { FakeScheduler } from "./fake-scheduler";
export { TestHarness, type TestHarnessOptions } from "./harness";
