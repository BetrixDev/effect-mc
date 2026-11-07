import { join } from "node:path";

/** Resolves the Java command from the flag, JAVA_HOME, then PATH. */
export function javaCommand(configured?: string): string {
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  const home = process.env.JAVA_HOME;
  if (home !== undefined && home.length > 0) {
    return join(home, "bin", process.platform === "win32" ? "java.exe" : "java");
  }
  return "java";
}
