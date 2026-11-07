import { noImportMetaUrl } from "./no-import-meta-url.ts";
import { tester } from "./rule-tester.ts";

const expectImportMetaUrl = { messageId: "noImportMetaUrl" };

tester.run("no-import-meta-url", noImportMetaUrl, {
  valid: ["const url = new URL('./data.json', base);", "const meta = import.meta;"],
  invalid: [
    { code: "const here = import.meta.url;", errors: [expectImportMetaUrl] },
    { code: 'const here = import.meta["url"];', errors: [expectImportMetaUrl] },
    { code: "load(import.meta.url);", errors: [expectImportMetaUrl] },
    { code: "new URL('./data.json', import.meta.url);", errors: [expectImportMetaUrl] },
  ],
});
