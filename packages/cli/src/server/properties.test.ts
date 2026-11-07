import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  parseServerProperties,
  readRconSettings,
  requireRconSettings,
  writeServerProperties,
} from "./properties";

test("parses properties while skipping comments and blank lines", () => {
  const properties = parseServerProperties(
    [
      "#Minecraft server properties",
      "enable-rcon=true",
      "rcon.port=25575",
      "rcon.password= secret=with=equals ",
      "",
      "level-name=world",
    ].join("\n"),
  );

  expect(properties.get("enable-rcon")).toBe("true");
  expect(properties.get("rcon.port")).toBe("25575");
  expect(properties.get("rcon.password")).toBe("secret=with=equals");
  expect(properties.get("level-name")).toBe("world");
});

test("requires RCON and says exactly what to add", () => {
  const properties = parseServerProperties("enable-rcon=false\nrcon.port=25575\n");

  expect(() => requireRconSettings(properties, "/srv/paper")).toThrow(/enable-rcon=true/);
  expect(() => requireRconSettings(properties, "/srv/paper")).toThrow(/rcon\.password/);
});

test("returns the configured endpoint", () => {
  expect(
    requireRconSettings(
      parseServerProperties("enable-rcon=true\nrcon.port=25580\nrcon.password=hunter2\n"),
      "/srv/paper",
    ),
  ).toEqual({ host: "127.0.0.1", port: 25580, password: "hunter2" });
});

test("rejects a blank password and a bad port", () => {
  expect(() =>
    requireRconSettings(
      parseServerProperties("enable-rcon=true\nrcon.port=25575\nrcon.password=\n"),
      "/srv/paper",
    ),
  ).toThrow(/rcon\.password/);

  expect(() =>
    requireRconSettings(
      parseServerProperties("enable-rcon=true\nrcon.port=not-a-port\nrcon.password=secret\n"),
      "/srv/paper",
    ),
  ).toThrow(/rcon\.port/);
});

test("updates only the RCON keys and preserves the rest of the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "effectmc-properties-"));
  await writeFile(
    join(directory, "server.properties"),
    ["# keep me", "motd=A server", "enable-rcon=false", "rcon.password=old"].join("\n"),
  );

  writeServerProperties(directory, {
    "enable-rcon": "true",
    "rcon.port": "25575",
    "rcon.password": "new",
  });

  const updated = await readFile(join(directory, "server.properties"), "utf8");
  expect(updated).toContain("# keep me");
  expect(updated).toContain("motd=A server");
  expect(updated).toContain("enable-rcon=true");
  expect(updated).toContain("rcon.password=new");
  expect(updated).not.toContain("enable-rcon=false");
  expect(updated).not.toContain("rcon.password=old");
});

test("reads the endpoint from a server directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "effectmc-properties-"));
  await writeFile(
    join(directory, "server.properties"),
    "enable-rcon=true\nrcon.port=25575\nrcon.password=secret\n",
  );

  expect(readRconSettings(directory)).toEqual({
    host: "127.0.0.1",
    port: 25575,
    password: "secret",
  });
});
