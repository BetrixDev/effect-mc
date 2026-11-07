import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { recommended as effectmcLintRules } from "./packages/lint/src/recommended";

export default defineConfig({
  defaultPackage: { pack: "./packages/core" },
  test: {
    // Tests run against workspace source, so a package does not need a build
    // before another package's tests can import it.
    alias: {
      "@effectmc/commands": fileURLToPath(
        new URL("./packages/commands/src/index.ts", import.meta.url),
      ),
      "@effectmc/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@effectmc/lint": fileURLToPath(new URL("./packages/lint/src/index.ts", import.meta.url)),
      "@effectmc/test": fileURLToPath(new URL("./packages/test/src/index.ts", import.meta.url)),
      "@effectmc/vite": fileURLToPath(new URL("./packages/vite/src/index.ts", import.meta.url)),
    },
  },
  fmt: {
    ignorePatterns: [
      "apps/docs/**/*.md",
      "apps/docs/.vitepress/cache/**",
      "apps/docs/.vitepress/dist/**",
      "packages/paper-types/generated/**",
    ],
  },
  lint: {
    // Overlays are declaration fragments that only typecheck once the
    // generated namespace around them exists.
    ignorePatterns: ["packages/paper-types/generated/**", "packages/paper-types/overlays/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    // The plugin is TypeScript source so `vp lint` works without a build.
    jsPlugins: ["./packages/lint/src/plugin.ts"],
    overrides: [
      {
        // These packages run inside the Graal context, so the runtime-impossible
        // APIs are illegal there. The Node toolchain packages legitimately use
        // timers and Promises.
        files: ["packages/core/src/**/*.ts", "packages/commands/src/**/*.ts"],
        excludeFiles: ["**/*.test.ts"],
        rules: { ...effectmcLintRules },
      },
    ],
  },
});
