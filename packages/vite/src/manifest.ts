import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The manifest file at the root of every container (ADR-0015). */
export const MANIFEST_FILE = "plugin.json";

/** The single bundled module the host evaluates. */
export const DEFAULT_ENTRY = "plugin.mjs";

const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const ENTRY = /^[A-Za-z0-9._-]{1,128}$/;

/** The validated contents of a container's `plugin.json`. */
export interface ContainerManifest {
  readonly name: string;
  readonly version: string;
  readonly entry: string;
}

/** A malformed manifest or an invalid value passed to the build. */
export class ContainerManifestError extends Error {
  override readonly name = "ContainerManifestError";
}

/** Whether a name satisfies the host's container-name rule. */
export function isValidContainerName(name: string): boolean {
  return NAME.test(name);
}

/** Throws with the same rule the host applies when it discovers a container. */
export function assertContainerName(name: string): void {
  if (!isValidContainerName(name)) {
    throw new ContainerManifestError(
      `Invalid container name '${name}': use lowercase letters, digits, '-' or '_' (maximum 64 characters).`,
    );
  }
}

/** Builds a manifest for the module this plugin writes. */
export function createManifest(input: { name: string; version: string }): ContainerManifest {
  assertContainerName(input.name);
  assertContainerVersion(input.version);
  return { name: input.name, version: input.version, entry: DEFAULT_ENTRY };
}

/** Serializes a manifest as the host reads it: two-space JSON and a newline. */
export function serializeManifest(manifest: ContainerManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Parses and validates manifest text from a loose container or a packed jar. */
export function parseContainerManifest(text: string, origin: string): ContainerManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ContainerManifestError(
      `Malformed ${MANIFEST_FILE} in ${origin}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContainerManifestError(`${MANIFEST_FILE} in ${origin} must contain a JSON object`);
  }

  const record = value as Record<string, unknown>;
  const name = requireString(record, "name", origin);
  const version = requireString(record, "version", origin);
  const entry = optionalString(record, "entry", origin) ?? DEFAULT_ENTRY;

  assertContainerName(name);
  assertContainerVersion(version);

  if (!ENTRY.test(entry) || entry === "." || entry === "..") {
    throw new ContainerManifestError(
      `Invalid entry '${entry}' in ${origin}: use a plain file name inside the container.`,
    );
  }
  if (entry === MANIFEST_FILE) {
    throw new ContainerManifestError(
      `Invalid entry '${entry}' in ${origin}: the entry must be the bundled module, not the manifest.`,
    );
  }

  return { name, version, entry };
}

/** Reads the manifest from a loose container directory. */
export function readContainerManifest(directory: string): ContainerManifest {
  const path = join(directory, MANIFEST_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new ContainerManifestError(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseContainerManifest(text, path);
}

function assertContainerVersion(version: string): void {
  if (!VERSION.test(version)) {
    throw new ContainerManifestError(
      `Invalid container version '${version}': use letters, digits, '.', '+', '-' or '_' (maximum 64 characters).`,
    );
  }
}

function requireString(record: Record<string, unknown>, field: string, origin: string): string {
  const value = optionalString(record, field, origin);
  if (value === undefined) {
    throw new ContainerManifestError(
      `Missing required field '${field}' in ${MANIFEST_FILE} in ${origin}`,
    );
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  origin: string,
): string | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ContainerManifestError(
      `Field '${field}' in ${MANIFEST_FILE} in ${origin} must be a string`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ContainerManifestError(
      `Field '${field}' in ${MANIFEST_FILE} in ${origin} must not be blank`,
    );
  }
  return trimmed;
}
