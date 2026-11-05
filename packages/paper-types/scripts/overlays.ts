import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareStrings } from "./sort.ts";

export type OverlayMode = "replace" | "merge";

export interface Overlay {
  /** The generated class this overlay applies to. */
  readonly target: string;
  /** One line explaining why the generator cannot express this declaration. */
  readonly reason: string;
  /** `replace` removes the generated declaration; `merge` keeps it. */
  readonly mode: OverlayMode;
  /** The overlay file, for diagnostics. */
  readonly file: string;
  /** The declaration text, appended after the generated output. */
  readonly body: string;
}

export interface LoadOverlaysOptions {
  readonly directory: string;
}

/**
 * Overlays are declaration fragments with two required header fields. They are
 * applied by replacing one generated class, so a patch cannot silently vanish
 * when the artifact is regenerated.
 */
export function loadOverlays(options: LoadOverlaysOptions): Overlay[] {
  let entries: string[];
  try {
    entries = readdirSync(options.directory);
  } catch (error) {
    throw new Error(`Cannot read overlay directory ${options.directory}: ${String(error)}`);
  }

  const files = entries
    .filter((entry) => entry.endsWith(".d.ts"))
    .sort((left, right) => compareStrings(left, right));

  const overlays: Overlay[] = [];
  const targets = new Set<string>();
  for (const file of files) {
    const path = join(options.directory, file);
    const text = readFileSync(path, "utf8");
    const header = leadingHeader(text);
    const target = readHeader(header, "target");
    const reason = readHeader(header, "reason");
    const modeHeader = readHeader(header, "mode") ?? "replace";
    if (target === undefined) {
      throw new Error(`${path}: missing @target`);
    }
    if (reason === undefined) {
      throw new Error(`${path}: missing @reason`);
    }
    if (modeHeader !== "replace" && modeHeader !== "merge") {
      throw new Error(`${path}: @mode must be replace or merge`);
    }
    if (/[\r\n]/u.test(reason)) {
      throw new Error(`${path}: @reason must be one line`);
    }
    if (targets.has(target)) {
      throw new Error(`${path}: duplicate overlay target ${target}`);
    }
    const body = text.trimEnd().replaceAll("\r\n", "\n");
    if (modeHeader === "replace") {
      const simpleName = target.split(".").pop() ?? target;
      const withoutComments = body.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
      if (!withoutComments.includes(simpleName)) {
        throw new Error(`${path}: @mode replace must declare ${simpleName}`);
      }
    }
    targets.add(target);
    overlays.push({
      target,
      reason,
      mode: modeHeader,
      file,
      body,
    });
  }

  return overlays.sort((left, right) => compareStrings(left.target, right.target));
}

function leadingHeader(text: string): string {
  return /^\s*\/\*\*([\s\S]*?)\*\//u.exec(text)?.[1] ?? "";
}

function readHeader(header: string, field: "target" | "reason" | "mode"): string | undefined {
  if (field === "reason") {
    return new RegExp(`@reason\\s+([^\\r\\n*]+)`, "u").exec(header)?.[1]?.trim();
  }
  return new RegExp(`@${field}\\s+(\\S+)`, "u").exec(header)?.[1]?.trim();
}
