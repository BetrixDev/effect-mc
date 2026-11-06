import { expect, test } from "vite-plus/test";
import type { EventListenerRegistration } from "@effectmc/core";
import { makeFakeEventBus } from "./fake-events";

class PingEvent {
  constructor(readonly id: string) {}

  isCancelled(): boolean {
    return false;
  }

  setCancelled(): void {}
}

const listener = (dispatch: EventListenerRegistration["dispatch"]): EventListenerRegistration => ({
  eventClass: PingEvent,
  eventName: "PingEvent",
  mode: "sync",
  priority: "normal",
  ignoreCancelled: false,
  dispatch,
});

test("dispatches to attachments and stops after removal", () => {
  const bus = makeFakeEventBus();
  const seen: Array<string> = [];
  const remove = bus.add(listener((event) => seen.push((event as PingEvent).id)));

  bus.dispatch(PingEvent, new PingEvent("one"));

  expect(seen).toEqual(["one"]);
  expect(bus.listeners()).toHaveLength(1);

  remove();
  bus.dispatch(PingEvent, new PingEvent("two"));

  expect(seen).toEqual(["one"]);
  expect(bus.listeners()).toEqual([]);
});

test("starts empty and clears every listener", () => {
  const bus = makeFakeEventBus();
  bus.add(listener(() => undefined));

  expect(bus.listeners()).toHaveLength(1);

  bus.clear();

  expect(bus.listeners()).toEqual([]);
});
