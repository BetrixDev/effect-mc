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
    ignorePatterns: ["packages/paper-types/generated/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
