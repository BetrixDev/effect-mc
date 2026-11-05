import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPaperApi } from "./artifact.ts";
import { emit, type EmitResult } from "./emit.ts";
import { readClass } from "./model.ts";
import { loadOverlays } from "./overlays.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedDirectory = join(packageRoot, "generated");
const indexPath = join(generatedDirectory, "index.d.ts");
const manifestPath = join(generatedDirectory, "manifest.json");

const MAX_WARNINGS = 20;

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const warnings: string[] = [];
  const artifact = await loadPaperApi();
  const classes = artifact.classes
    .map((entry) =>
      readClass(entry.bytes, {
        onWarning: (message) => warnings.push(`${entry.name}: ${message}`),
      }),
    )
    .filter((model) => model !== undefined);

  const overlays = loadOverlays({ directory: join(packageRoot, "overlays") });
  const result = emit({
    pin: artifact.pin,
    classes,
    overlays,
  });

  reportWarnings(warnings);
  if (check) {
    checkGenerated(result);
  } else {
    writeGenerated(result);
    process.stdout.write(
      `Generated ${result.classCount} Paper classes (${result.externalCount} external types, ${overlays.length} overlays).\n`,
    );
  }
}

function reportWarnings(warnings: ReadonlyArray<string>): void {
  for (const warning of warnings.slice(0, MAX_WARNINGS)) {
    process.stderr.write(`warning: ${warning}\n`);
  }
  if (warnings.length > MAX_WARNINGS) {
    process.stderr.write(`warning: ${warnings.length - MAX_WARNINGS} more warnings\n`);
  }
}

function checkGenerated(result: EmitResult): void {
  const stale = [checkFile(indexPath, result.dts), checkFile(manifestPath, result.manifest)];
  if (stale.some(Boolean)) {
    process.stderr.write(
      "Generated Paper types are out of date. Run `npm run generate --workspace @effectmc/paper-types`.\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Paper types are reproducible (${result.classCount} classes, ${result.externalCount} external types).\n`,
  );
}

function writeGenerated(result: EmitResult): void {
  mkdirSync(generatedDirectory, { recursive: true });
  writeFileSync(indexPath, result.dts);
  writeFileSync(manifestPath, result.manifest);
}

/** Returns true and reports the first mismatch when the file is stale. */
function checkFile(path: string, expected: string): boolean {
  if (!existsSync(path)) {
    process.stderr.write(`missing ${path}\n`);
    return true;
  }
  const actual = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  if (actual === expected) {
    return false;
  }
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      process.stderr.write(
        `${path}:${index + 1}\n  expected: ${expectedLines[index] ?? "<eof>"}\n  actual:   ${actualLines[index] ?? "<eof>"}\n`,
      );
      break;
    }
  }
  return true;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
