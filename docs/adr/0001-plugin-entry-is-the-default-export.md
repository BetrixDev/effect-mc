# ADR-0001: A plugin module's default export is the `Plugin` value

- **Status:** Accepted (2026-11-03)

## Context

`design/architecture.md:60` showed `EffectMC.Plugin(name, layers, program)` while the package table at `architecture.md:27` showed a bare `Plugin()`. A third option was an Alchemy-style class where the plugin name doubles as an Effect tag and every plugin takes an `env` parameter.

The host has to find the plugin declaration in an evaluated module, so whichever form wins becomes a shared contract between the host, the typings, and every tutorial.

## Decision

A plugin module's default export is the `Plugin` value:

```typescript
export default Plugin("demo", Layer, program)
```

No `EffectMC.` namespace. No magic named export. No class form.

## Consequences

- The file is the unit of deployment, so its default export is the deployment. The host reads one known location.
- The `EffectMC.` prefix disappears from the public surface, which also removes a second name for the same function.
- Plugins cannot carry per-plugin configuration through a class environment. Configuration arrives through Layers, which is where the dependency-injection machinery already lives.
- Nothing prevents a module from also default-exporting nonsense; the host validates shape at load and fails loudly.
