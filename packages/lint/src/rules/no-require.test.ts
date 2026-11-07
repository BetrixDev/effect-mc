import { noRequire } from "./no-require.ts";
import { tester } from "./rule-tester.ts";

const expectRequire = { messageId: "noRequire" };

tester.run("no-require", noRequire, {
  valid: [
    "import { readFile } from 'node:fs';",
    "const loader = { require: () => {} }; loader.require('x');",
    "const load = () => {}; load('x');",
    "function outer() { const require = () => {}; require('x'); }",
  ],
  invalid: [
    { code: "const fs = require('node:fs');", errors: [expectRequire] },
    { code: "require.resolve('node:fs');", errors: [expectRequire] },
    { code: "function outer() { require('node:fs'); }", errors: [expectRequire] },
  ],
});
