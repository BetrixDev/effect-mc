import { expect, test } from "vite-plus/test";
import { parseArgs } from "./args";

test("defaults to dev when no command is given", () => {
  expect(parseArgs([])).toEqual({ kind: "help" });
  expect(parseArgs(["dev"])).toEqual({ kind: "dev", options: {} });
});

test("parses the server override and every tuning flag", () => {
  expect(
    parseArgs([
      "dev",
      "--server",
      "C:\\paper",
      "--root",
      "C:\\plugin",
      "--host-jar",
      "effectmc-host.jar",
      "--java",
      "C:\\jdk\\bin\\java.exe",
      "--paper-version",
      "1.21.8",
      "--cache",
      "C:\\cache",
      "--rcon-port",
      "25580",
      "--rcon-password",
      "secret",
      "--debounce",
      "250",
    ]),
  ).toEqual({
    kind: "dev",
    options: {
      serverDirectory: "C:\\paper",
      root: "C:\\plugin",
      hostJar: "effectmc-host.jar",
      javaCommand: "C:\\jdk\\bin\\java.exe",
      paperVersion: "1.21.8",
      cacheDirectory: "C:\\cache",
      rconPort: 25580,
      rconPassword: "secret",
      debounceMs: 250,
    },
  });
});

test("supports help and version", () => {
  expect(parseArgs(["--help"])).toEqual({ kind: "help" });
  expect(parseArgs(["help"])).toEqual({ kind: "help" });
  expect(parseArgs(["--version"])).toEqual({ kind: "version" });
});

test("rejects unknown commands and missing values", () => {
  expect(() => parseArgs(["serve"])).toThrow(/Unknown command/);
  expect(() => parseArgs(["dev", "--server"])).toThrow(/--server/);
  expect(() => parseArgs(["dev", "--unknown"])).toThrow(/Unknown option '--unknown'/);
  expect(() => parseArgs(["dev", "--debounce", "soon"])).toThrow(/--debounce/);
  expect(() => parseArgs(["dev", "--rcon-port", "70000"])).toThrow(/--rcon-port/);
});
