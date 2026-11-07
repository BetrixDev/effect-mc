# @effectmc/lint

Name-based Oxlint rules for APIs the plugin runtime cannot support. An author
gets an editor error before the host evaluates a module that would fail at
runtime.

The rules are deliberately name-based (ADR-0018). Oxlint's custom JS plugin
rules receive no type information, so this package does not attempt the
threading model. See [What lint does not check](#what-lint-does-not-check).

## Rules

| Rule                          | Rejects                                                         | Use instead                                                                                                         |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `effectmc/no-timers`          | `setTimeout`, `setInterval`, `setImmediate`                     | `Effect.sleep` for a delay, `Effect.repeat` with a `Schedule` for recurring work, `Tasks.attach` for a registration |
| `effectmc/no-require`         | CommonJS `require`                                              | A static `import` so the bundler includes the dependency                                                            |
| `effectmc/no-dynamic-import`  | Dynamic `import()`                                              | A static `import` so the bundler puts the target in `plugin.mjs`                                                    |
| `effectmc/no-top-level-await` | `await` and `for await` outside a function                      | `Effect.gen(function* () { ... })` with `yield*` inside the plugin program                                          |
| `effectmc/no-raw-promise`     | `new Promise`, `Promise.*`, and `.then` / `.catch` / `.finally` | `Effect.promise` or `Effect.tryPromise` to enter from a Promise, and `Effect.gen` for sequencing                    |
| `effectmc/no-import-meta-url` | `import.meta.url`                                               | A static `import` for bundled data                                                                                  |

`setImmediate` is banned with the timers because it is the same class of API:
host time, not tick time.

## Usage

Register the plugin and enable its rules in the same `lint` block:

```ts
// vite.config.ts
import { defineConfig } from "vite-plus";
import { recommended } from "@effectmc/lint";

export default defineConfig({
  lint: {
    jsPlugins: ["@effectmc/lint"],
    rules: { ...recommended },
  },
});
```

`recommended` is a ready-made map with every rule at `error`. Enable individual
rules instead when a project needs an exception:

```ts
export default defineConfig({
  lint: {
    jsPlugins: ["@effectmc/lint"],
    rules: {
      "effectmc/no-timers": "error",
      "effectmc/no-raw-promise": "warn",
    },
  },
});
```

A source checkout can point `jsPlugins` at the plugin file instead of the
packaged entry, which avoids a build step:

```ts
jsPlugins: ["./packages/lint/src/plugin.ts"],
```

The plugin file uses explicit `.ts` import extensions because Oxlint loads it
through Node's ESM resolver.

## What lint does not check

**Thread violations are not checked by lint.** A call into a `Main`-requiring
façade from an async handler is a type error, not a lint error: the capability
lives in the effect's `R`, and a name-based rule cannot see it. Raw Bukkit
access is invisible to both the lint package and the thread checker (ADR-0003).

The thread story is the type system (`Main` in `R`) plus runtime dev asserts.
Those two mechanisms are the whole guarantee; lint is not a third one. A
type-aware thread checker remains possible later as a separate compiler-API
pass, but it is not part of v0, and this package is not shaped as if it were.

Likewise, these rules match names, not values. A locally shadowed `setTimeout`,
an imported `require`, or an object's own `.then` method does not resolve to the
global the rule is looking for, so scope resolution keeps those out. A custom
thenable called `.then` still looks like a Promise chain and is reported.

## Layout

| File                              | Contents                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `src/plugin.ts`                   | The `effectmc` plugin and its rule map                    |
| `src/plugin-name.ts`              | The `effectmc` namespace shared by the plugin and presets |
| `src/recommended.ts`              | Every rule at `error`                                     |
| `src/rules/no-timers.ts`          | Host timers                                               |
| `src/rules/no-require.ts`         | CommonJS `require`                                        |
| `src/rules/no-dynamic-import.ts`  | Dynamic `import()`                                        |
| `src/rules/no-top-level-await.ts` | Top-level `await` and `for await`                         |
| `src/rules/no-raw-promise.ts`     | Raw `Promise` construction, statics, and chains           |
| `src/rules/no-import-meta-url.ts` | `import.meta.url`                                         |
| `src/rules/refers-to-global.ts`   | Name-and-scope check shared by the identifier rules       |
| `src/rules/property-name.ts`      | Static member-name lookup shared by the member rules      |
| `src/rules/rule-tester.ts`        | Shared `RuleTester` configured for module sources         |
