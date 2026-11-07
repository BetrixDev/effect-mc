# Warps and homes sample

The v0 contract proof: a plugin that enables, serves global warps and
per-player homes, survives a caveated reload, and disables without leaving a
listener, task, or GUI registration behind.

## Commands

| Command            | Behaviour                                                        |
| ------------------ | ---------------------------------------------------------------- |
| `/warp set <name>` | Saves the sender's current location in the `WarpService` service |
| `/warp go <name>`  | Teleports the sender to a saved warp                             |
| `/warp list`       | Lists the saved warp names                                       |
| `/home set`        | Saves the sender's current location in their persistent data     |
| `/home go`         | Teleports the sender to their saved home                         |

`/warp` requires `effectmc.warp`; `/home` requires `effectmc.home`. A console
sender gets `SenderNotPlayer`, not a permission error (ADR-0020). A missing warp
or home is a tagged error the command boundary renders; it never takes down the
tick (ADR-0005).

## Where the state lives

- **Warps** live in `WarpService`, an in-memory `Ref` Layer. A caveated reload
  rebuilds the Layer, so warps reset. That is the honest difference between
  runtime state and durable data.
- **Homes** live in the player's `PersistentDataContainer` under the
  `warps-homes` namespace. The PDC survives the runtime rebuild, so `/home go`
  still works after a reload.
- The join listener writes the player's current world to the `seen` PDC key.
  Its only purpose is to make listener teardown observable in a test.

## Build

The package uses the published toolchain; there is no bespoke Vite setup:

```ts
import { effectmc } from "@effectmc/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({ plugins: [effectmc()] });
```

```bash
vp run @effectmc/warps-homes#build
```

The build produces `dist/plugin.mjs` and `dist/plugin.json`, exactly the loose
container a host discovers under `plugins/EffectMC/warps-homes/` (ADR-0015).
The module default-exports the `Plugin` value (ADR-0001).

## Test

`src/sample.test.ts` runs the plugin through `PluginHost` with the
`@effectmc/test` fakes. It covers enable plus command registration, warp
set/go, home set/go, permission rendering, a scoped reload with a neighbour
plugin left running, and teardown.

```bash
vp test apps/warps-homes/src/sample.test.ts
```

## Paper boundary

`@effectmc/paper-types` is types only, so the two runtime values the sample
needs come through `PaperPlatform`:

- the `PlayerJoinEvent` class, and
- a world lookup plus `Location` construction for a persisted home.

`PaperPlatformLive` resolves those through the host's GraalJS `Java.type`
bridge. Tests replace the Layer with a fake event class and in-memory worlds.
The sample's own tests never start the live Layer.

Reading the sender's current location is a raw Bukkit read; v0 has no
location-reading façade. The only world mutation in the sample goes through
`Players.teleport`, so the thread checker still covers the mutation (ADR-0003).

**Host status:** the Java host currently discovers a container, evaluates its
module, and requires a default export, but it does not yet build a
`PluginRuntime` or provide `CommandRegistrar`, `EventBus`, `SenderContext`,
`PdcPlatform`, and the hop seams. It also does not dispatch Paper events into
the TypeScript event bus. "Enables on a managed server" is therefore **not**
exercised by this package; the highest honest seam is `PluginHost` plus the test
fakes. When the host grows that wiring, this sample is the first integration
check to run.

`Tasks` and GUI resources do not have attach verbs in this layer. The sample
attaches the listener through `Events.attach` and asserts that the Registry is
empty across every kind after teardown, but it does not invent a task or GUI
registration to make that assertion look richer.
