import { defineConfig } from "vite-plus";

export default defineConfig({
  defaultPackage: { pack: "./packages/core" },
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
  },
});
