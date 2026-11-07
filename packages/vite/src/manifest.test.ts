import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  assertContainerName,
  createManifest,
  isValidContainerName,
  parseContainerManifest,
  readContainerManifest,
  serializeManifest,
} from "./manifest";

test("accepts the names the host accepts", () => {
  expect(isValidContainerName("hello")).toBe(true);
  expect(isValidContainerName("hello-world_2")).toBe(true);
  expect(isValidContainerName("0hello")).toBe(true);
  expect(isValidContainerName("Hello")).toBe(false);
  expect(isValidContainerName("-hello")).toBe(false);
  expect(isValidContainerName("")).toBe(false);
  expect(isValidContainerName("a".repeat(65))).toBe(false);
});

test("assertContainerName explains the host's rule", () => {
  expect(() => assertContainerName("Hello World")).toThrow(/lowercase letters, digits, '-' or '_'/);
});

test("creates and serializes a manifest with a trailing newline", () => {
  const manifest = createManifest({ name: "hello", version: "0.1.0" });

  expect(manifest).toEqual({ name: "hello", version: "0.1.0", entry: "plugin.mjs" });
  expect(serializeManifest(manifest)).toBe(
    '{\n  "name": "hello",\n  "version": "0.1.0",\n  "entry": "plugin.mjs"\n}\n',
  );
});

test("parses a manifest and rejects malformed fields with the source path", () => {
  expect(
    parseContainerManifest(
      JSON.stringify({ name: "hello", version: "0.1.0", entry: "main.mjs" }),
      "dist/plugin.json",
    ),
  ).toEqual({ name: "hello", version: "0.1.0", entry: "main.mjs" });

  expect(() => parseContainerManifest("[]", "dist/plugin.json")).toThrow(/JSON object/);
  expect(() => parseContainerManifest("{}", "dist/plugin.json")).toThrow(/name/);
  expect(() =>
    parseContainerManifest(JSON.stringify({ name: "Hello", version: "0.1.0" }), "here"),
  ).toThrow(/Invalid container name/);
  expect(() =>
    parseContainerManifest(JSON.stringify({ name: "hello", version: "" }), "here"),
  ).toThrow(/version/);
  expect(() =>
    parseContainerManifest(
      JSON.stringify({ name: "hello", version: "0.1.0", entry: "../escape.mjs" }),
      "here",
    ),
  ).toThrow(/entry/);
});

test("reads the manifest from a container directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "effectmc-manifest-"));
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "plugin.json"),
    JSON.stringify({ name: "hello", version: "0.1.0" }),
  );

  expect(readContainerManifest(directory)).toEqual({
    name: "hello",
    version: "0.1.0",
    entry: "plugin.mjs",
  });
});
