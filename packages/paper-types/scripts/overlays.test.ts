import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { loadOverlays } from "./overlays.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function overlayDirectory(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "effectmc-overlays-"));
  directories.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(directory, name), contents);
  }
  return directory;
}

describe("overlays", () => {
  test("reads the target, reason, and mode", () => {
    const directory = overlayDirectory({
      "world.d.ts": `/**
 * @target org.bukkit.World
 * @mode merge
 * @reason ForwardingAudience is outside paper-api.
 */
export namespace org.bukkit {
  export interface World {}
}
`,
    });

    expect(loadOverlays({ directory })).toEqual([
      {
        target: "org.bukkit.World",
        mode: "merge",
        reason: "ForwardingAudience is outside paper-api.",
        file: "world.d.ts",
        body: expect.stringContaining("@target org.bukkit.World"),
      },
    ]);
  });

  test("defaults to replace mode", () => {
    const directory = overlayDirectory({
      "item.d.ts": `/**
 * @target org.bukkit.inventory.ItemStack
 * @reason The generated declaration needs a hand-written correction.
 */
export class ItemStack {}
`,
    });

    expect(loadOverlays({ directory })[0]?.mode).toBe("replace");
  });

  test("rejects an overlay without a reason", () => {
    const directory = overlayDirectory({
      "broken.d.ts": "/** @target org.bukkit.World */\nexport interface World {}\n",
    });

    expect(() => loadOverlays({ directory })).toThrow(/missing @reason/);
  });

  test("rejects duplicate targets", () => {
    const directory = overlayDirectory({
      "first.d.ts": "/** @target org.bukkit.World @mode merge @reason one */\n",
      "second.d.ts": "/** @target org.bukkit.World @mode merge @reason two */\n",
    });

    expect(() => loadOverlays({ directory })).toThrow(/duplicate overlay target/);
  });

  test("rejects an unknown mode", () => {
    const directory = overlayDirectory({
      "broken.d.ts": `/**
 * @target org.bukkit.World
 * @mode append
 * @reason one
 */
`,
    });

    expect(() => loadOverlays({ directory })).toThrow(/replace or merge/);
  });

  test("rejects a missing overlay directory", () => {
    expect(() => loadOverlays({ directory: join(tmpdir(), "effectmc-missing-overlays") })).toThrow(
      /Cannot read overlay directory/,
    );
  });

  test("rejects a replace overlay that does not declare its target", () => {
    const directory = overlayDirectory({
      "broken.d.ts": `/**
 * @target org.bukkit.World
 * @mode replace
 * @reason one
 */
`,
    });

    expect(() => loadOverlays({ directory })).toThrow(/must declare World/);
  });
});
