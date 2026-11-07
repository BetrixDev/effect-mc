import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rconInstruction, type RconSettings } from "./rcon";

export class RconConfigurationError extends Error {
  override readonly name = "RconConfigurationError";
}

/** Parses Paper's `key=value` properties, ignoring comments and blank lines. */
export function parseServerProperties(text: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    properties.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
  }
  return properties;
}

/** Reads `server.properties` from an existing server directory. */
export function readServerProperties(directory: string): Map<string, string> {
  const path = join(directory, "server.properties");
  if (!existsSync(path)) {
    throw new RconConfigurationError(
      `No server.properties found in ${directory}. ` +
        "Point --server at a Paper server directory, or run effectmc dev without --server.\n\n" +
        rconInstruction(),
    );
  }
  return parseServerProperties(readFileSync(path, "utf8"));
}

/** Reads and validates the RCON endpoint an existing server exposes. */
export function readRconSettings(directory: string): RconSettings {
  return requireRconSettings(readServerProperties(directory), directory);
}

/**
 * Requires RCON to be enabled and configured. The dev loop cannot trigger the
 * host's scoped reload without it, so this fails with an instruction instead of
 * waiting for a connection that will never open (ADR-0017).
 */
export function requireRconSettings(
  properties: Map<string, string>,
  serverDirectory: string,
): RconSettings {
  const path = join(serverDirectory, "server.properties");
  const port = rconPort(properties, path);

  if (properties.get("enable-rcon")?.toLowerCase() !== "true") {
    throw new RconConfigurationError(`RCON is disabled in ${path}.\n\n${rconInstruction(port)}`);
  }

  const password = properties.get("rcon.password")?.trim();
  if (password === undefined || password.length === 0) {
    throw new RconConfigurationError(
      `RCON has no password in ${path}.\n\n${rconInstruction(port)}`,
    );
  }

  return { host: "127.0.0.1", port, password };
}

function rconPort(properties: Map<string, string>, path: string): number {
  const raw = properties.get("rcon.port") ?? "25575";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RconConfigurationError(
      `Invalid rcon.port '${raw}' in ${path}: use a port from 1 to 65535.`,
    );
  }
  return port;
}

/**
 * Updates only the supplied keys and leaves every other property alone, so a
 * managed server keeps the author's settings between runs.
 */
export function writeServerProperties(
  directory: string,
  updates: Readonly<Record<string, string>>,
): void {
  const path = join(directory, "server.properties");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const applied = new Set<string>();
  const lines = existing.length === 0 ? [] : existing.split(/\r?\n/);

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("!")) {
      return line;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      return line;
    }
    const key = line.slice(0, separator).trim();
    const value = updates[key];
    if (value === undefined) {
      return line;
    }
    applied.add(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!applied.has(key)) {
      updated.push(`${key}=${value}`);
    }
  }

  writeFileSync(path, `${updated.join("\n").replace(/\n+$/, "")}\n`);
}
