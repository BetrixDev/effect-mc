import { noDynamicImport } from "./no-dynamic-import.ts";
import { tester } from "./rule-tester.ts";

tester.run("no-dynamic-import", noDynamicImport, {
  valid: ["import { Effect } from 'effect';", "const name = 'import';"],
  invalid: [
    { code: "const module = import('./module');", errors: [{ messageId: "noDynamicImport" }] },
    {
      code: "const load = async () => import('./module');",
      errors: [{ messageId: "noDynamicImport" }],
    },
  ],
});
