import { HELP, parseArgs, VERSION } from "./args";
import { runDev, type DevDependencies } from "./dev";
import { formatError } from "./log";

/** The process entry point: parse, run, and turn errors into an instruction. */
export async function main(
  argv: readonly string[],
  dependencies: Partial<DevDependencies> = {},
): Promise<number> {
  let command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${formatError(error)}`);
    return 1;
  }

  if (command.kind === "help") {
    console.log(HELP);
    return 0;
  }
  if (command.kind === "version") {
    console.log(VERSION);
    return 0;
  }

  const controller = new AbortController();
  const onSignal = (): void => controller.abort();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    await runDev({ ...command.options, signal: controller.signal }, dependencies);
    return 0;
  } catch (error) {
    if (controller.signal.aborted) {
      return 0;
    }
    console.error(`error: ${formatError(error)}`);
    if (process.env.EFFECTMC_DEBUG === "1") {
      console.error(error);
    }
    return 1;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
