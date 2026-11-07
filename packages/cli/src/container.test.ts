import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { FileContainerDeployer, type BuildOutput } from "./container";

const temporaryDirectory = (prefix: string) => mkdtemp(join(tmpdir(), prefix));

const writeContainer = async (directory: string, module: string): Promise<BuildOutput> => {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "plugin.json"),
    JSON.stringify({ name: "hello", version: "0.1.0", entry: "plugin.mjs" }),
  );
  await writeFile(join(directory, "plugin.mjs"), module);
  return {
    outDir: directory,
    manifest: { name: "hello", version: "0.1.0", entry: "plugin.mjs" },
  };
};

test("deploys the loose container under plugins/EffectMC", async () => {
  const build = await temporaryDirectory("effectmc-build-");
  const server = await temporaryDirectory("effectmc-server-");
  const output = await writeContainer(build, 'export default { name: "hello" };');

  const deployed = await new FileContainerDeployer().deploy(output, server);

  expect(deployed).toEqual({
    name: "hello",
    directory: join(server, "plugins", "EffectMC", "hello"),
  });
  expect(await readdir(deployed.directory)).toEqual(
    expect.arrayContaining(["plugin.json", "plugin.mjs"]),
  );
  expect(await readFile(join(deployed.directory, "plugin.mjs"), "utf8")).toContain("hello");
});

test("replaces the previous bundle on redeploy", async () => {
  const build = await temporaryDirectory("effectmc-build-");
  const server = await temporaryDirectory("effectmc-server-");
  const deployer = new FileContainerDeployer();
  const output = await writeContainer(build, 'export default { name: "first" };');
  const deployed = await deployer.deploy(output, server);

  await writeFile(join(build, "plugin.mjs"), 'export default { name: "second" };');
  await deployer.deploy(output, server);

  expect(await readFile(join(deployed.directory, "plugin.mjs"), "utf8")).toContain("second");
});

test("fails with the missing artifact name", async () => {
  const build = await temporaryDirectory("effectmc-build-");
  const server = await temporaryDirectory("effectmc-server-");
  const output = await writeContainer(build, "export default {};");
  await rm(join(build, "plugin.mjs"));

  await expect(new FileContainerDeployer().deploy(output, server)).rejects.toThrow(/plugin\.mjs/);
});
