import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { build } from "vite";
import { effectmc } from "./index";

const project = async (
  packageJson: Record<string, unknown>,
  files: Record<string, string>,
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "effectmc-vite-"));
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents);
  }
  return root;
};

const importDefault = async (modulePath: string): Promise<unknown> => {
  const namespace = (await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`)) as {
    default: unknown;
  };
  return namespace.default;
};

test("builds one bundled ES module plus the manifest", async () => {
  const root = await project(
    { name: "hello", version: "0.1.0", type: "module" },
    {
      "src/index.ts": [
        'import { greet } from "./greet";',
        'export default { name: "hello", greet };',
      ].join("\n"),
      "src/greet.ts": 'export const greet = () => "hello from a container";',
    },
  );

  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [effectmc()],
    build: { outDir: "container" },
  });

  const output = join(root, "container");
  expect((await readdir(output)).sort()).toEqual(["plugin.json", "plugin.mjs"]);

  expect(JSON.parse(await readFile(join(output, "plugin.json"), "utf8"))).toEqual({
    name: "hello",
    version: "0.1.0",
    entry: "plugin.mjs",
  });

  const module = await readFile(join(output, "plugin.mjs"), "utf8");
  expect(module).not.toMatch(/\bimport\s*[("']/);
  expect(module).not.toMatch(/\brequire\s*\(/);

  const plugin = (await importDefault(join(output, "plugin.mjs"))) as {
    name: string;
    greet: () => string;
  };
  expect(plugin.name).toBe("hello");
  expect(plugin.greet()).toBe("hello from a container");
});

test("bundles a dependency even when the author marks it external", async () => {
  const root = await project(
    { name: "hello", version: "0.1.0", type: "module" },
    {
      "src/index.ts": [
        'import { greet } from "./greet";',
        'export default { name: "hello", greet };',
      ].join("\n"),
      "src/greet.ts": 'export const greet = () => "still bundled";',
    },
  );

  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [effectmc()],
    build: {
      outDir: "container",
      rolldownOptions: { external: ["./greet"] },
    },
  });

  const module = await readFile(join(root, "container", "plugin.mjs"), "utf8");
  expect(module).not.toMatch(/\bimport\s*[("']/);
  const plugin = (await importDefault(join(root, "container", "plugin.mjs"))) as {
    greet: () => string;
  };
  expect(plugin.greet()).toBe("still bundled");
});

test("forces one ES output even when the author asks for another format", async () => {
  const root = await project(
    { name: "hello", version: "0.1.0", type: "module" },
    { "src/index.ts": 'export default { name: "hello" };' },
  );

  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [effectmc()],
    build: {
      outDir: "container",
      lib: { entry: "src/index.ts", formats: ["es", "cjs"], fileName: "custom" },
    },
  });

  expect((await readdir(join(root, "container"))).sort()).toEqual(["plugin.json", "plugin.mjs"]);
});

test("honours explicit name, version, entry, and outDir options", async () => {
  const root = await project(
    { name: "@scope/ignored", version: "9.9.9", type: "module" },
    { "src/plugin.ts": 'export default { name: "chosen" };' },
  );

  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [
      effectmc({ name: "chosen", version: "1.2.3", entry: "src/plugin.ts", outDir: "build" }),
    ],
    build: { outDir: "ignored" },
  });

  expect(JSON.parse(await readFile(join(root, "build", "plugin.json"), "utf8"))).toEqual({
    name: "chosen",
    version: "1.2.3",
    entry: "plugin.mjs",
  });
  expect(await readdir(join(root, "build"))).toEqual(expect.arrayContaining(["plugin.mjs"]));
});

test("derives the container name from a scoped package name", async () => {
  const root = await project(
    { name: "@effectmc/hello", version: "0.1.0", type: "module" },
    { "src/index.ts": 'export default { name: "hello" };' },
  );

  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [effectmc()],
    build: { outDir: "container" },
  });

  expect(JSON.parse(await readFile(join(root, "container", "plugin.json"), "utf8")).name).toBe(
    "hello",
  );
});

test("fails with an instruction when no entry exists", async () => {
  const root = await project(
    { name: "hello", version: "0.1.0", type: "module" },
    { "README.md": "nothing to build" },
  );

  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [effectmc()],
      build: { outDir: "container" },
    }),
  ).rejects.toThrow(/entry/i);
});

test("fails with an instruction when the package name cannot be a container name", async () => {
  const root = await project(
    { name: "Hello World", version: "0.1.0", type: "module" },
    { "src/index.ts": 'export default { name: "hello" };' },
  );

  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [effectmc()],
      build: { outDir: "container" },
    }),
  ).rejects.toThrow(/name option/);
});
