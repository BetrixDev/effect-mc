import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { ViteBuildSessionFactory, type BuildResult } from "./build-session";

const vitePlugin = pathToFileURL(join(process.cwd(), "packages", "vite", "src", "index.ts")).href;

test(
  "starts a real Vite watch build and reports the first container",
  { timeout: 15_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "effectmc-session-"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "hello", version: "0.1.0", type: "module" }),
    );
    await writeFile(join(root, "src", "index.ts"), 'export default { name: "hello" };');
    await writeFile(
      join(root, "vite.config.ts"),
      [
        `import { effectmc } from ${JSON.stringify(vitePlugin)};`,
        "export default { plugins: [effectmc()], build: { outDir: 'container' } };",
      ].join("\n"),
    );

    const session = await new ViteBuildSessionFactory().start({
      root,
      logLevel: "silent",
      log: () => {},
    });
    try {
      const result = await session.first;
      if (!result.ok) {
        throw result.error;
      }
      expect(result.output.manifest.name).toBe("hello");
      expect(await readFile(join(result.output.outDir, "plugin.mjs"), "utf8")).toContain("hello");

      const rebuild = new Promise<BuildResult>((resolve) => session.onBuild(resolve));
      await writeFile(
        join(root, "src", "index.ts"),
        'export default { name: "hello", version: 2 };',
      );
      const next = await rebuild;
      if (!next.ok) {
        throw next.error;
      }
      expect(await readFile(join(result.output.outDir, "plugin.mjs"), "utf8")).toContain("version");
    } finally {
      await session.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("requires the EffectMC plugin in the Vite config", async () => {
  const root = await mkdtemp(join(tmpdir(), "effectmc-session-"));
  try {
    await writeFile(
      join(root, "vite.config.ts"),
      "export default { build: { outDir: 'container' } };",
    );
    await expect(new ViteBuildSessionFactory().start({ root, log: () => {} })).rejects.toThrow(
      /@effectmc\/vite/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
