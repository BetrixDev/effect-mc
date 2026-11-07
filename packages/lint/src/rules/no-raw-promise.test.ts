import { noRawPromise } from "./no-raw-promise.ts";
import { tester } from "./rule-tester.ts";

const expectRawPromise = { messageId: "noRawPromise" };

tester.run("no-raw-promise", noRawPromise, {
  valid: [
    "const effect = Effect.succeed(1);",
    "const value = Effect.promise(() => load());",
    "const caught = either.catchError(() => Effect.void);",
    "const result = [1, 2].map((n) => n + 1);",
    "class Promise {}; new Promise();",
  ],
  invalid: [
    { code: "new Promise((resolve) => resolve(1));", errors: [expectRawPromise] },
    { code: "fetch('/').then((response) => response.text());", errors: [expectRawPromise] },
    { code: "load().catch(() => {});", errors: [expectRawPromise] },
    { code: "load().finally(() => {});", errors: [expectRawPromise] },
    { code: "Promise.resolve(1);", errors: [expectRawPromise] },
    { code: "Promise.all([load()]);", errors: [expectRawPromise] },
    { code: "Promise['resolve'](1);", errors: [expectRawPromise] },
    { code: "load()['then'](() => {});", errors: [expectRawPromise] },
    { code: "function outer() { new Promise(() => {}); }", errors: [expectRawPromise] },
  ],
});
