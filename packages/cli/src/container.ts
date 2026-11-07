import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MANIFEST_FILE, type ContainerManifest } from "@effectmc/vite";

/** One successful build: the loose container directory and its manifest. */
export interface BuildOutput {
  readonly outDir: string;
  readonly manifest: ContainerManifest;
}

/** Where the host will find the container. */
export interface DeployedContainer {
  readonly name: string;
  readonly directory: string;
}

/** Writes a build output into a server's container root. */
export interface ContainerDeployer {
  deploy(output: BuildOutput, serverDirectory: string): Promise<DeployedContainer>;
}

/**
 * Deploys into `plugins/EffectMC/<name>/`, the loose-container shape the host
 * reads (ADR-0015). Each file is replaced through a temporary file, so a
 * running host never reads a half-written module.
 */
export class FileContainerDeployer implements ContainerDeployer {
  async deploy(output: BuildOutput, serverDirectory: string): Promise<DeployedContainer> {
    const directory = join(serverDirectory, "plugins", "EffectMC", output.manifest.name);
    mkdirSync(directory, { recursive: true });

    copyAtomic(join(output.outDir, MANIFEST_FILE), join(directory, MANIFEST_FILE));
    copyAtomic(join(output.outDir, output.manifest.entry), join(directory, output.manifest.entry));

    return { name: output.manifest.name, directory };
  }
}

function copyAtomic(source: string, target: string): void {
  if (!existsSync(source)) {
    throw new Error(`The build did not produce ${source}.`);
  }

  const temporary = `${target}.tmp`;
  writeFileSync(temporary, readFileSync(source));
  renameSync(temporary, target);
}
