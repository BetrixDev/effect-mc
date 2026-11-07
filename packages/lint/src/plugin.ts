import { definePlugin } from "vite-plus/lint/plugins";
import { noDynamicImport } from "./rules/no-dynamic-import.ts";
import { noImportMetaUrl } from "./rules/no-import-meta-url.ts";
import { noRawPromise } from "./rules/no-raw-promise.ts";
import { noRequire } from "./rules/no-require.ts";
import { noTimers } from "./rules/no-timers.ts";
import { noTopLevelAwait } from "./rules/no-top-level-await.ts";
import { pluginName } from "./plugin-name.ts";

/**
 * Name-based rules for APIs the plugin runtime cannot provide. They do not
 * check the threading model; see ADR-0018 and `README.md`.
 */
export const plugin = definePlugin({
  meta: { name: pluginName },
  rules: {
    "no-timers": noTimers,
    "no-require": noRequire,
    "no-dynamic-import": noDynamicImport,
    "no-top-level-await": noTopLevelAwait,
    "no-raw-promise": noRawPromise,
    "no-import-meta-url": noImportMetaUrl,
  },
});

export default plugin;
