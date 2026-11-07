# Glossary

EffectMC's domain language, repo-wide. Terms land here when a decision turns on them, and every issue, ADR, test name, and exported identifier uses these words — no synonyms.

## Host and lifecycle

- **plugin module** — the TypeScript entry file the host evaluates. Its default export is the `Plugin` value. One module per Paper plugin.
- **Plugin** — the declarative value a plugin module exports: a name, the Layers that satisfy its requirements, and a finite program. Distinct from `JavaPlugin`, Paper's own object, which authors reach only through `PluginRef`.
- **plugin runtime** — the `PluginRuntime` value that builds the plugin's Layer, runs its program, and owns the scope for everything the program attached. Disposal is terminal; a restart constructs a new plugin runtime.
- **plugin host** — the in-process owner of one plugin runtime per name. A scoped reload replaces one entry and leaves the others untouched. `PluginHost` is that owner in core; the Paper host exposes the same sequence as `/effectmc reload <name>`.
- **program** — the finite `Effect` passed to `Plugin`. It installs registrations and then completes. A program that blocks is not a program; a long-lived stream belongs in an attach.
- **attach** — the single registration verb. `Events.attach`, `Commands.attach`, `Tasks.attach` install something into the Registry for the plugin's lifetime and return a handle. Attaching forks scoped; the program still completes.
- **Registry** — the host-side record of everything a plugin attached: listeners, tasks, and open GUIs. Teardown empties it before `context.close`. Commands are not recorded because they cannot be unregistered.
- **registration** — one entry in the Registry. Commands are not registrations; they are re-registered on reload (ADR-0011).
- **caveated reload** — dispose the runtime, empty the Registry, close the Context, open a new Context, start the plugin module again. Never called hot module reload, and never called production-safe until the 50× leak spike passes.

## Threads

- **capability** — a requirement in `R` that states _where_ code may run, as opposed to a hop that moves it. `Main` and `AsyncThread` are capabilities.
- **Main** — capability: Bukkit world APIs are legal here. Carries the region payload from day one (ADR-0007).
- **region** — the `Main` payload naming the entity or location that owns the region. Always absent on Paper; reserved for Folia.
- **AsyncThread** — capability: an async Bukkit context, with a time budget and no world access.
- **hop** — a construct that changes the executing thread. `Paper.on` enters `Main`; `Paper.offload` runs Java work on a worker and resumes without `Main`. A bare `yield* Main` is neither: it declares and reads a capability, it does not move the fiber.
- **SyncWindow** — the unbuffered window inside a Bukkit listener dispatch during which `event.cancel` typechecks. Buffering, debouncing, sleeping, offloading, or forking closes it, and the element becomes a snapshot.

## Surface

- **façade** — a curated EffectMC wrapper over a Paper API that carries its thread capability in `R`. v0 ships four: `Sender`, `Players`, `Worlds`, `Items` (ADR-0006).
- **EventHandle** — the element `Events.of` yields: a snapshot of the Bukkit event, whose `cancel` requires `SyncWindow` in `R`. There is no nominal event-stream type (ADR-0008).
- **event bus** — the runtime-owned seam behind `Events`: one listener group per event type × priority × mode, fanning out to attachments and honoring `ignoreCancelled` per attachment (ADR-0023). The Paper host implements it; tests use the in-memory one.
- **Pdc** — Schema-typed persistent data: a `NamespacedKey` plus a Schema codec, mapped to a `PersistentDataType`. Lives in core (ADR-0009).
- **raw** — direct Bukkit/Paper access. It compiles and runs, but it is outside the thread checker, so misuse is silent. Documented as the exception, never the pattern.
- **namespace surface** — the import shape: one namespace object per concept (`Paper.`, `Events.`, `Pdc.`, `Players.`) plus bare tags (`Main`, `AsyncThread`, `SyncWindow`).

## Toolchain

- **host jar** — `effectmc-host.jar`, the only Paper plugin. Installed once, owns Graal, the tick pump, and the Registry.
- **tick clock** — plugin time. It is anchored to server boot time and advances only when the host pumps a tick, so `Effect.sleep`, schedules, and timeouts freeze while the server is paused or stopped. It never follows the system clock after that and never installs a timer.
- **container** — an author plugin's artifact: `plugin.json` plus `plugin.mjs`. A loose directory during development, a packed `.jar` for distribution. Lives under `plugins/EffectMC/<name>/`, which Paper never scans (ADR-0015).
- **dev loop** — `effectmc dev`: bundle, write the container, then trigger the host's scoped reload. Managed server by default, `--server <dir>` to attach (ADR-0016).
- **scoped reload** — `/effectmc reload <name>` over RCON. Rebuilds one plugin's Context; not module-level hot reload (ADR-0017).

## Errors

- **Renderer** — the swappable service that turns a tagged error into an Adventure component at a command or event boundary.
- **Observability** — the swappable service that receives runtime diagnostics, such as the warning that a program did not complete. The default layer writes to the server log.
- **boundary** — where a program's failure meets a player: the command executor, the sync event dispatch, the async event dispatch. Each has a different failure policy.

## Writing rules

- Say **caveated reload**, not "hot reload".
- Say **attach**, not "register", for putting something into the Registry.
- Say **façade**, not "wrapper", for the curated Paper surface.
- Say **raw**, not "unsafe" or "low-level", for direct Bukkit access.
