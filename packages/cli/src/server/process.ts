import { spawn } from "node:child_process";

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ManagedProcess {
  readonly exited: Promise<ProcessExit>;
  /** Subscribes to output lines, replaying the tail seen so far. */
  onLine(listener: (line: string) => void): () => void;
  kill(): Promise<void>;
}

export interface ProcessFactory {
  spawn(command: string, args: readonly string[], options: { cwd: string }): ManagedProcess;
}

/** Spawns a JVM and turns its stdout and stderr into line events. */
export class NodeProcessFactory implements ProcessFactory {
  spawn(command: string, args: readonly string[], options: { cwd: string }): ManagedProcess {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const listeners = new Set<(line: string) => void>();
    const history: string[] = [];
    const emit = (line: string): void => {
      if (line.length === 0) {
        return;
      }
      history.push(line);
      if (history.length > 200) {
        history.shift();
      }
      for (const listener of listeners) {
        listener(line);
      }
    };

    const lineReader = (): ((chunk: Buffer | string) => void) => {
      let buffer = "";
      return (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          emit(line.replace(/\r$/, ""));
        }
      };
    };

    child.stdout.on("data", lineReader());
    child.stderr.on("data", lineReader());
    child.on("error", (error) => {
      emit(`Could not start ${command}: ${error.message}`);
    });

    const exited = new Promise<ProcessExit>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });

    return {
      exited,
      onLine(listener) {
        for (const line of history) {
          listener(line);
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async kill() {
        if (child.exitCode === null && child.signalCode === null && !child.killed) {
          child.kill("SIGKILL");
        }
        await exited;
      },
    };
  }
}
