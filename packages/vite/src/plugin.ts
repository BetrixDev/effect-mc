import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Plugin, ResolvedConfig, UserConfig } from "vite";
import {
  createManifest,
  DEFAULT_ENTRY,
  isValidContainerName,
  MANIFEST_FILE,
  serializeManifest,
  type ContainerManifest,
} from "./manifest";

/** The name the CLI looks for on the resolved Vite config. */
export const EFFECTMC_PLUGIN_NAME = "effectmc";

const DEFAULT_ENTRIES = ["src/index.ts", "src/index.tsx", "index.ts"] as const;

/** Options for the EffectMC Vite plugin. */
export interface EffectMcOptions {
  /** Container name. Defaults to the package.json name with any scope removed. */
  name?: string;
  /** Container version. Defaults to the package.json version, then `0.0.0`. */
  version?: string;
  /** Module entry. Defaults to `src/index.ts`, then `src/index.tsx`, then `index.ts`. */
  entry?: string;
  /** Container output directory. Defaults to Vite's `build.outDir`, usually `dist`. */
  outDir?: string;
}

interface PackageJson {
  readonly name?: unknown;
  readonly version?: unknown;
}

/**
 * Builds an EffectMC container: one bundled ES module with no externals, next
 * to the manifest the host reads (ADR-0015).
 */
export function effectmc(options: EffectMcOptions = {}): Plugin {
  let manifest: ContainerManifest | undefined;
  let resolved: ResolvedConfig | undefined;

  return {
    name: EFFECTMC_PLUGIN_NAME,
    apply: "build",

    config(config) {
      const root = resolveRoot(config);
      manifest = resolveManifest(root, options);
      const build: NonNullable<UserConfig["build"]> = {
        lib: {
          entry: resolveEntry(root, options.entry),
          formats: ["es"],
          fileName: () => DEFAULT_ENTRY,
        },
        target: "es2022",
        minify: false,
        rolldownOptions: {
          external: [],
          output: { codeSplitting: false },
        },
      };
      if (options.outDir !== undefined) {
        build.outDir = resolve(root, options.outDir);
      }
      return { build };
    },

    configResolved(config) {
      resolved = config;
      // The plugin's `config` hook can be merged with author settings; force
      // the two properties that make a container a container.
      const rolldown = config.build.rolldownOptions;
      if (rolldown !== undefined) {
        rolldown.external = [];
        const output = rolldown.output;
        if (Array.isArray(output)) {
          for (const entry of output) entry.codeSplitting = false;
        } else if (output !== undefined) {
          output.codeSplitting = false;
        }
      }

      const lib = config.build.lib;
      if (lib === false) {
        throw new Error(
          "The EffectMC build requires Vite library mode. Remove build.lib: false and rebuild.",
        );
      }
      if (lib !== undefined) {
        lib.formats = ["es"];
        lib.fileName = () => DEFAULT_ENTRY;
      }
    },

    generateBundle(_outputOptions, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
      if (chunks.length !== 1) {
        this.error(
          `The EffectMC build must emit exactly one bundled module, but emitted ${chunks.length} chunks. ` +
            "Use one entry and keep build.rolldownOptions.output.codeSplitting disabled.",
        );
      }

      const chunk = chunks[0]!;
      const external = [...chunk.imports, ...chunk.dynamicImports];
      if (external.length > 0) {
        this.error(
          `The EffectMC build must bundle every dependency, but left ${external.join(", ")} external. ` +
            "Remove build.rolldownOptions.external and rebuild.",
        );
      }
      if (chunk.fileName !== DEFAULT_ENTRY) {
        this.error(
          `The EffectMC build must emit ${DEFAULT_ENTRY}, but emitted ${chunk.fileName}. ` +
            "Remove custom output file names.",
        );
      }
    },

    writeBundle(outputOptions) {
      const current = manifest;
      if (current === undefined) {
        this.error("The EffectMC plugin did not resolve a container manifest.");
      }

      const directory = outputOptions.dir ?? resolved?.build.outDir ?? process.cwd();
      const target = join(directory, MANIFEST_FILE);
      const temporary = `${target}.tmp`;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(temporary, serializeManifest(current));
      renameSync(temporary, target);
    },
  };
}

function resolveRoot(config: UserConfig): string {
  return config.root === undefined ? process.cwd() : resolve(process.cwd(), config.root);
}

function resolveManifest(root: string, options: EffectMcOptions): ContainerManifest {
  const packageJson = readPackageJson(root);
  const name = options.name ?? packageName(packageJson, root);
  const version = options.version ?? stringField(packageJson?.version) ?? "0.0.0";
  return createManifest({ name, version });
}

function readPackageJson(root: string): PackageJson | undefined {
  const path = join(root, "package.json");
  if (!existsSync(path)) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return value as PackageJson;
}

function packageName(packageJson: PackageJson | undefined, root: string): string {
  const name = stringField(packageJson?.name);
  if (name === undefined) {
    throw new Error(
      `Could not infer a container name from package.json in ${root}. ` +
        'Pass the name option: effectmc({ name: "hello" }).',
    );
  }

  const withoutScope = name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
  if (!isValidContainerName(withoutScope)) {
    throw new Error(
      `The package name '${name}' is not a valid container name. ` +
        `Container names use lowercase letters, digits, '-' or '_'. ` +
        'Pass the name option: effectmc({ name: "hello" }).',
    );
  }
  return withoutScope;
}

function resolveEntry(root: string, entry: string | undefined): string {
  if (entry !== undefined) {
    const path = resolve(root, entry);
    if (!existsSync(path)) {
      throw new Error(
        `The EffectMC entry '${entry}' does not exist. ` +
          `Create it or pass a different entry option.`,
      );
    }
    return path;
  }

  for (const candidate of DEFAULT_ENTRIES) {
    const path = join(root, candidate);
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error(
    `Could not find an EffectMC entry. Looked for ${DEFAULT_ENTRIES.join(", ")}. ` +
      `Create src/index.ts or pass the entry option: effectmc({ entry: "src/plugin.ts" }).`,
  );
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
