import { expect, test } from "vite-plus/test";
import plugin, { recommended } from "./index.ts";

const RULE_NAMES = [
  "no-timers",
  "no-require",
  "no-dynamic-import",
  "no-top-level-await",
  "no-raw-promise",
  "no-import-meta-url",
];

test("registers a rule for every unsupported API", () => {
  expect(plugin.meta?.name).toBe("effectmc");
  expect(Object.keys(plugin.rules ?? {})).toEqual(RULE_NAMES);
});

test("recommends every rule as an error", () => {
  expect(Object.keys(recommended)).toHaveLength(RULE_NAMES.length);

  for (const name of RULE_NAMES) {
    expect(recommended).toHaveProperty(`effectmc/${name}`, "error");
  }
});

test("every diagnostic explains what to use instead", () => {
  for (const [name, rule] of Object.entries(plugin.rules ?? {})) {
    const messages = Object.values(rule.meta?.messages ?? {});
    expect(messages.length, name).toBeGreaterThan(0);

    for (const message of messages) {
      expect(message, name).toMatch(/\bUse\b/);
    }
  }
});
