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

const HEADER_PATTERNS = {
  target: /@target\s+(\S+)/u,
  mode: /@mode\s+(\S+)/u,
  reason: /@reason\s+([^\r\n*]+)/u,
} as const;

type HeaderField = keyof typeof HEADER_PATTERNS;

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

  const overlays: Overlay[] = [];
  const targets = new Set<string>();
  for (const file of entries.filter((entry) => entry.endsWith(".d.ts")).sort(compareStrings)) {
    const overlay = readOverlay(options.directory, file);
    if (targets.has(overlay.target)) {
      throw new Error(
        `${join(options.directory, file)}: duplicate overlay target ${overlay.target}`,
      );
    }
    targets.add(overlay.target);
    overlays.push(overlay);
  }

  return overlays.sort((left, right) => compareStrings(left.target, right.target));
}

function readOverlay(directory: string, file: string): Overlay {
  const path = join(directory, file);
  const text = readFileSync(path, "utf8");
  const header = leadingHeader(text);
  const target = readHeader(header, "target");
  const reason = readHeader(header, "reason");
  if (target === undefined) {
    throw new Error(`${path}: missing @target`);
  }
  if (reason === undefined) {
    throw new Error(`${path}: missing @reason`);
  }
  const declaredMode = readHeader(header, "mode");
  if (declaredMode !== undefined && declaredMode !== "replace" && declaredMode !== "merge") {
    throw new Error(`${path}: @mode must be replace or merge`);
  }
  if (/[\r\n]/u.test(reason)) {
    throw new Error(`${path}: @reason must be one line`);
  }

  const mode = declaredMode ?? "replace";
  const body = text.trimEnd().replaceAll("\r\n", "\n");
  if (mode === "replace") {
    assertTargetDeclared(path, target, body);
  }
  return { target, reason, mode, file, body };
}

function assertTargetDeclared(path: string, target: string, body: string): void {
  const simpleName = target.split(".").pop() ?? target;
  const withoutComments = body.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  if (!withoutComments.includes(simpleName)) {
    throw new Error(`${path}: @mode replace must declare ${simpleName}`);
  }
}

function leadingHeader(text: string): string {
  return /^\s*\/\*\*([\s\S]*?)\*\//u.exec(text)?.[1] ?? "";
}

function readHeader(header: string, field: HeaderField): string | undefined {
  return HEADER_PATTERNS[field].exec(header)?.[1]?.trim();
}
