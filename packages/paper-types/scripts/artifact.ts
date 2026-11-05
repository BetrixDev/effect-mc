import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { compareStrings } from "./sort.ts";

export interface PaperApiPin {
  readonly coordinate: string;
  readonly version: string;
  readonly url: string;
  readonly sha256: string;
}

export interface ClassEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface Artifact {
  readonly pin: PaperApiPin;
  readonly classes: ReadonlyArray<ClassEntry>;
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pin = JSON.parse(readFileSync(join(packageRoot, "paper-api.json"), "utf8")) as PaperApiPin;

/**
 * Loads the pinned Paper API jar, downloading it into the package cache the
 * first time. The SHA-256 check is the reproducibility boundary: a different
 * artifact cannot silently change the generated output.
 */
export async function loadPaperApi(): Promise<Artifact> {
  const bytes = await loadJar();
  const hash = sha256(bytes);
  if (hash !== pin.sha256) {
    throw new Error(
      `Paper API hash mismatch for ${pin.coordinate}: expected ${pin.sha256}, got ${hash}`,
    );
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Could not unzip ${pin.coordinate} (${pin.url}): ${String(error)}`);
  }

  const classes = Object.entries(files)
    .filter(
      ([name]) =>
        name.endsWith(".class") &&
        !name.startsWith("META-INF/") &&
        name !== "module-info.class" &&
        !name.endsWith("/module-info.class") &&
        !name.endsWith("/package-info.class"),
    )
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([name, classBytes]) => ({ name, bytes: classBytes }));

  if (classes.length === 0) {
    throw new Error(`No classes found in ${pin.coordinate}`);
  }

  return { pin, classes };
}

async function loadJar(): Promise<Uint8Array> {
  const cacheDir = join(packageRoot, ".cache");
  const cachePath = join(cacheDir, `paper-api-${pin.version}.jar`);

  if (existsSync(cachePath)) {
    const cached = readFileSync(cachePath);
    if (sha256(cached) === pin.sha256) {
      return cached;
    }
    rmSync(cachePath, { force: true });
  }

  mkdirSync(cacheDir, { recursive: true });
  process.stderr.write(`Downloading ${pin.coordinate}...\n`);
  const response = await fetch(pin.url);
  if (!response.ok) {
    throw new Error(`Could not download ${pin.url}: ${response.status} ${response.statusText}`);
  }
  const downloaded = new Uint8Array(await response.arrayBuffer());
  writeFileSync(cachePath, downloaded);
  return downloaded;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
