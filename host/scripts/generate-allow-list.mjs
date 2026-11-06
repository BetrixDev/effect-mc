#!/usr/bin/env node
// Generates the host's Java class-name allow-list from the pinned Paper typings.
//
// The allow-list is the security boundary for Java.type() inside a container:
// only fully-qualified names listed here may be looked up. Entries that are not
// derivable from Paper typings (for example curated EffectMC façades) belong in
// allow-list.extra.txt.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hostRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(hostRoot);
const typingsPath = join(repoRoot, "packages", "paper-types", "generated", "index.d.ts");
const extraPath = join(hostRoot, "allow-list.extra.txt");
const outputPath = join(hostRoot, "allow-list.txt");

const header = [
  "# Generated from @effectmc/paper-types by host/scripts/generate-allow-list.mjs.",
  "# Do not edit by hand. Add entries to allow-list.extra.txt and regenerate.",
  "",
].join("\n");

const typings = readFileSync(typingsPath, "utf8");
const names = new Set();
let namespace = null;

for (const line of typings.split(/\r?\n/)) {
  const opened = /^export namespace ([\w.$]+) \{/.exec(line);
  if (opened !== null) {
    // __paperExternal is a TypeScript alias for types outside paper-api. Their
    // real names include JDK reflection classes, so they are not in the boundary.
    namespace = opened[1].startsWith("__paperExternal.") ? null : opened[1];
    continue;
  }

  const declared = /^  export (?:abstract )?(?:class|interface|enum|record) ([\w$]+)/.exec(line);
  if (namespace !== null && declared !== null) {
    names.add(`${namespace}.${declared[1]}`);
  }
}

const extra = readFileSync(extraPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

for (const name of extra) {
  names.add(name);
}

if (names.size < 2000) {
  throw new Error(
    `Only ${names.size} class names were found in ${typingsPath}; the typings file is probably stale or malformed.`,
  );
}

const output = `${header}${[...names].sort().join("\n")}\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== output) {
    process.stderr.write(
      "allow-list.txt is out of date. Run `npm run generate:allow-list` (or the host Gradle generateAllowList task).\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(`allow-list.txt is current (${names.size} classes).\n`);
  }
} else {
  writeFileSync(outputPath, output);
  process.stdout.write(`Wrote ${names.size} classes to allow-list.txt.\n`);
}
