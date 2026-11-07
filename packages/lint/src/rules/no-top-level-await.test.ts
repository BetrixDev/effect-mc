import { noTopLevelAwait } from "./no-top-level-await.ts";
import { tester } from "./rule-tester.ts";

const expectTopLevelAwait = { messageId: "noTopLevelAwait" };

tester.run("no-top-level-await", noTopLevelAwait, {
  valid: [
    "async function load() { await fetch('/'); }",
    "const load = async () => { await fetch('/'); };",
    "const load = async function () { await fetch('/'); };",
    "class Loader { async load() { await fetch('/'); } }",
    "async function read(stream) { for await (const chunk of stream) {} }",
    "const value = Effect.succeed(1);",
  ],
  invalid: [
    { code: "await load();", errors: [expectTopLevelAwait] },
    { code: "for await (const chunk of stream) {}", errors: [expectTopLevelAwait] },
    { code: "if (ready) { await load(); }", errors: [expectTopLevelAwait] },
  ],
});
