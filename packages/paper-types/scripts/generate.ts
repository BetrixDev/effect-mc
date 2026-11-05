import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPaperApi } from "./artifact.ts";
import { emit } from "./emit.ts";
import { readClass } from "./model.ts";
import { loadOverlays } from "./overlays.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedDirectory = join(packageRoot, "generated");
const indexPath = join(generatedDirectory, "index.d.ts");
const manifestPath = join(generatedDirectory, "manifest.json");

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

  for (const warning of warnings.slice(0, 20)) {
    process.stderr.write(`warning: ${warning}\n`);
  }
  if (warnings.length > 20) {
    process.stderr.write(`warning: ${warnings.length - 20} more warnings\n`);
  }

  if (check) {
    let failed = false;
    failed = differs(indexPath, result.dts) || failed;
    failed = differs(manifestPath, result.manifest) || failed;
    if (failed) {
      process.stderr.write(
        "Generated Paper types are out of date. Run `npm run generate --workspace @effectmc/paper-types`.\n",
      );
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `Paper types are reproducible (${result.classCount} classes, ${result.externalCount} external types).\n`,
      );
    }
  } else {
    mkdirSync(generatedDirectory, { recursive: true });
    writeFileSync(indexPath, result.dts);
    writeFileSync(manifestPath, result.manifest);
    process.stdout.write(
      `Generated ${result.classCount} Paper classes (${result.externalCount} external types, ${overlays.length} overlays).\n`,
    );
  }
}

function differs(path: string, expected: string): boolean {
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
