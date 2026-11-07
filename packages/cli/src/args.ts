import type { DevOptions } from "./dev";

export type Command =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "dev"; readonly options: DevOptions };

export const VERSION = "0.0.0";

export const HELP = `effectmc — run a Paper server and reload your plugin on save

Usage:
  effectmc dev [options]

Options:
  --server <dir>        Attach to an existing Paper server instead of managing one
  --root <dir>          Project root containing vite.config.ts (default: current directory)
  --host-jar <path>     EffectMC host jar for the managed server
  --java <path>         Java command (default: JAVA_HOME/bin/java, then java)
  --paper-version <v>   Paper version to download (default: 1.21.8)
  --cache <dir>         Download cache (default: the user cache directory)
  --rcon-port <port>    RCON port for the managed server (default: 25575)
  --rcon-password <pw>  RCON password for the managed server
  --debounce <ms>       Delay before deploying a burst of saves (default: 150)
  --help, -h            Show this help
  --version, -v         Show the version

The dev loop sends /effectmc reload <name> over RCON: a scoped Context
rebuild, not hot module reload.`;

type MutableOptions = { -readonly [Key in keyof DevOptions]: DevOptions[Key] };

const FLAGS: Readonly<Record<string, (options: MutableOptions, value: string) => void>> = {
  "--server": (options, value) => {
    options.serverDirectory = value;
  },
  "--root": (options, value) => {
    options.root = value;
  },
  "--host-jar": (options, value) => {
    options.hostJar = value;
  },
  "--java": (options, value) => {
    options.javaCommand = value;
  },
  "--paper-version": (options, value) => {
    options.paperVersion = value;
  },
  "--cache": (options, value) => {
    options.cacheDirectory = value;
  },
  "--rcon-password": (options, value) => {
    options.rconPassword = value;
  },
  "--rcon-port": (options, value) => {
    options.rconPort = integer("--rcon-port", value, 1, 65_535);
  },
  "--debounce": (options, value) => {
    options.debounceMs = integer("--debounce", value, 0, 60_000);
  },
};

export function parseArgs(argv: readonly string[]): Command {
  const first = argv[0];
  if (first === undefined || first === "help" || first === "--help" || first === "-h") {
    return { kind: "help" };
  }
  if (first === "--version" || first === "-v") {
    return { kind: "version" };
  }
  if (first !== "dev") {
    throw new Error(`Unknown command '${first}'. Run effectmc --help for usage.`);
  }

  const options: MutableOptions = {};

  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index]!;
    if (flag === "--help" || flag === "-h") {
      return { kind: "help" };
    }
    if (flag === "--version" || flag === "-v") {
      return { kind: "version" };
    }
    if (!flag.startsWith("--")) {
      throw new Error(`Unexpected argument '${flag}'.`);
    }
    const apply = FLAGS[flag];
    if (apply === undefined) {
      throw new Error(`Unknown option '${flag}'. Run effectmc --help for usage.`);
    }
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}.`);
    }
    index++;
    apply(options, value);
  }

  return { kind: "dev", options };
}

function integer(flag: string, value: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Invalid value '${value}' for ${flag}: use an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}
