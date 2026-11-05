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
const pinPath = join(packageRoot, "paper-api.json");

/** Validates the pin file instead of trusting `JSON.parse`'s `any`. */
export function parsePin(text: string, source: string): PaperApiPin {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON: ${String(error)}`);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: expected a JSON object`);
  }
  const record = value as Record<string, unknown>;
  return {
    coordinate: requireString(record, "coordinate", source),
    version: requireString(record, "version", source),
    url: requireString(record, "url", source),
    sha256: requireString(record, "sha256", source),
  };
}

function requireString(record: Record<string, unknown>, field: string, source: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${source}: ${field} must be a non-empty string`);
  }
  return value;
}

/**
 * Loads the pinned Paper API jar, downloading it into the package cache the
 * first time. The SHA-256 check is the reproducibility boundary: a different
 * artifact cannot silently change the generated output.
 */
export async function loadPaperApi(): Promise<Artifact> {
  const pin = readPin();
  const bytes = await loadJar(pin);
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

function readPin(): PaperApiPin {
  return parsePin(readFileSync(pinPath, "utf8"), pinPath);
}

async function loadJar(pin: PaperApiPin): Promise<Uint8Array> {
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
