import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { loadOverlays } from "./overlays.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

describe("published package", () => {
  test("resolves types through the package exports", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      types?: string;
      exports?: Record<string, { types?: string }>;
      dependencies?: Record<string, string>;
      files?: string[];
    };

    expect(packageJson.types).toBe("./generated/index.d.ts");
    expect(packageJson.exports?.["."]?.types).toBe("./generated/index.d.ts");
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.files).toContain("generated");
    expect(existsSync(join(packageRoot, "generated/index.d.ts"))).toBe(true);
  });

  test("declares no runtime imports", () => {
    const declaration = readFileSync(join(packageRoot, "generated/index.d.ts"), "utf8");
    expect(declaration).not.toMatch(/^import /mu);
    expect(declaration).not.toMatch(/^export .* from /mu);
  });

  test("records the pinned artifact and every overlay reason", () => {
    const pin = JSON.parse(readFileSync(join(packageRoot, "paper-api.json"), "utf8")) as {
      coordinate: string;
      sha256: string;
    };
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "generated/manifest.json"), "utf8"),
    ) as {
      artifact: string;
      sha256: string;
      overlays: Array<{ target: string; reason: string; mode: string }>;
    };
    const overlays = loadOverlays({
      directory: join(packageRoot, "overlays"),
    });

    expect(manifest.artifact).toBe(pin.coordinate);
    expect(manifest.sha256).toBe(pin.sha256);
    expect(manifest.overlays).toHaveLength(overlays.length);
    for (const overlay of overlays) {
      expect(overlay.reason.length).toBeGreaterThan(0);
      expect(overlay.reason).not.toContain("\n");
      expect(["replace", "merge"]).toContain(overlay.mode);
    }
  });

  test("applies every overlay to the generated declarations", () => {
    const declaration = readFileSync(join(packageRoot, "generated/index.d.ts"), "utf8");
    const overlays = loadOverlays({
      directory: join(packageRoot, "overlays"),
    });

    for (const overlay of overlays) {
      expect(declaration).toContain(`// ${overlay.target} (${overlay.mode}): ${overlay.reason}`);
      expect(declaration).toContain(overlay.body);
    }
  });

  test("regeneration matches the committed declarations", () => {
    execFileSync(process.execPath, [join(packageRoot, "scripts/generate.ts"), "--check"], {
      cwd: packageRoot,
      stdio: "pipe",
      timeout: 120_000,
    });
  }, 120_000);

  test("exports the four documented top-level types", () => {
    const declaration = readFileSync(join(packageRoot, "generated/index.d.ts"), "utf8");
    for (const name of ["BlockBreakEvent", "ItemStack", "Player", "World"]) {
      expect(declaration).toContain(`export type ${name} =`);
    }
  });

  test("the strict consumer fixture typechecks", () => {
    const tsc = require.resolve("typescript/bin/tsc");
    execFileSync(
      process.execPath,
      [tsc, "-p", join(packageRoot, "consumer/tsconfig.json"), "--noEmit"],
      { stdio: "pipe" },
    );
  }, 30_000);
});
