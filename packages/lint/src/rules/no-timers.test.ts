import { noTimers } from "./no-timers.ts";
import { tester } from "./rule-tester.ts";

const expectTimer = { messageId: "noTimers" };

tester.run("no-timers", noTimers, {
  valid: [
    "const timers = { setTimeout: () => {} }; timers.setTimeout();",
    "function setTimeout() {} setTimeout();",
    "import { setTimeout } from './timers'; setTimeout(() => {}, 0);",
    "function outer() { const setTimeout = () => {}; setTimeout(); }",
    "const window = { setTimeout: () => {} }; window.setTimeout();",
    "const n = 1;",
  ],
  invalid: [
    { code: "setTimeout(() => {}, 0);", errors: [expectTimer] },
    { code: "setInterval(() => {}, 50);", errors: [expectTimer] },
    { code: "setImmediate(() => {});", errors: [expectTimer] },
    { code: "globalThis.setTimeout(() => {}, 0);", errors: [expectTimer] },
    { code: "globalThis['setTimeout'](() => {}, 0);", errors: [expectTimer] },
    { code: "function outer() { setTimeout(() => {}); }", errors: [expectTimer] },
    { code: "window.setInterval(() => {}, 1);", errors: [expectTimer] },
    { code: "const schedule = setTimeout;", errors: [expectTimer] },
  ],
});
