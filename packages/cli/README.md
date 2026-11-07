# effectmc

The EffectMC command line. `effectmc dev` builds your plugin, deploys it as a
loose container under `plugins/EffectMC/<name>/`, and sends the host's
`/effectmc reload <name>` over RCON after every save. That reload is a scoped
Context rebuild, not hot module reload (ADR-0017).

## Before you start

- JDK 25. The host requires it.
- A plugin project with `@effectmc/vite` in `vite.config.ts` and a module at
  `src/index.ts` whose default export is `Plugin(...)`.
- The EffectMC host jar, unless it is already installed in the server you point
  at. Build it with `cd host && ./gradlew build` and pass `--host-jar`.

## Managed server

```bash
npx effectmc dev
```

On the first run the command:

1. downloads Paper into a user cache (later runs reuse it),
2. creates `.effectmc/server` and accepts the Minecraft EULA,
3. enables RCON in `server.properties` and writes a password there,
4. installs `effectmc-host.jar` under `plugins/`, and
5. starts the server, waits for `Done (`, and opens RCON.

The first build is deployed before the server starts, so the host discovers it
at boot. Later saves rebuild, deploy, and send `/effectmc reload <name>` after a
short debounce.

## An existing server

```bash
npx effectmc dev --server path/to/paper
```

The loop does not download, launch, or stop anything in this mode. It deploys
into the same container root, then triggers the same scoped reload. The server
must already have `effectmc-host.jar` in `plugins/` and RCON enabled:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=an-example-secret
```

If RCON is disabled, missing a password, or not reachable, the command prints
those lines and exits. It does not wait for a timeout.

## Options

| Option                 | Default                           | Meaning                                   |
| ---------------------- | --------------------------------- | ----------------------------------------- |
| `--server <dir>`       | managed server                    | Attach to an existing Paper installation. |
| `--root <dir>`         | current directory                 | Project root containing `vite.config.ts`. |
| `--host-jar <path>`    | discovered / `EFFECTMC_HOST_JAR`  | Host jar installed into a managed server. |
| `--java <path>`        | `JAVA_HOME/bin/java`, then `java` | Java command.                             |
| `--paper-version <v>`  | `1.21.8`                          | Paper version to download.                |
| `--cache <dir>`        | user cache directory              | Where downloaded Paper builds are cached. |
| `--rcon-port <port>`   | `25575`                           | RCON port for a managed server.           |
| `--rcon-password <pw>` | generated, reused                 | RCON password for a managed server.       |
| `--debounce <ms>`      | `150`                             | Delay before deploying a burst of saves.  |
| `--help`, `-h`         |                                   | Show usage.                               |
| `--version`, `-v`      |                                   | Show the version.                         |

## What the loop does not do

- It never runs Paper's `/reload` and never restarts the server to pick up a
  save.
- It does not hot-swap module state. The host disposes the runtime, empties the
  Registry, closes the Context, and runs the program again.
- It does not pack the distribution jar. The container it writes is the loose
  shape the host reads; packing the same two files into `<name>.jar` is the
  distribution step described in `host/README.md`.
