import { pluginName } from "./plugin-name.ts";

/**
 * Every rule at `error`, ready to spread into a lint config's `rules` map.
 *
 * ```ts
 * import { defineConfig } from "vite-plus";
 * import { recommended } from "@effectmc/lint";
 *
 * export default defineConfig({
 *   lint: {
 *     jsPlugins: ["@effectmc/lint"],
 *     rules: { ...recommended },
 *   },
 * });
 * ```
 */
export const recommended = {
  [`${pluginName}/no-timers`]: "error",
  [`${pluginName}/no-require`]: "error",
  [`${pluginName}/no-dynamic-import`]: "error",
  [`${pluginName}/no-top-level-await`]: "error",
  [`${pluginName}/no-raw-promise`]: "error",
  [`${pluginName}/no-import-meta-url`]: "error",
} as const;
