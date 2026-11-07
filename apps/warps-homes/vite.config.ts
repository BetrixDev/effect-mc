import { effectmc } from "@effectmc/vite";
import { defineConfig } from "vite-plus";

// The published toolchain owns the container shape: one bundled, external-free
// plugin.mjs plus the plugin.json the host discovers (ADR-0015).
export default defineConfig({
  plugins: [effectmc()],
});
