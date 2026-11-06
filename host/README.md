# EffectMC host

The only Paper plugin for EffectMC. It discovers containers under
`plugins/EffectMC/`, evaluates each container's module in its own GraalJS
`Context`, and confines that Context to a per-plugin owner thread.

## Requirements

- JDK 25 or newer. The Gradle build enforces the toolchain, and the host logs
  the running Java version at boot.
- The pinned Paper API is `io.papermc.paper:paper-api:26.3.build.230-stable`.

## Build and test

```bash
# Windows
gradlew.bat build

# Everything else
./gradlew build
```

`build` runs the tests, verifies the build toolchain is Java 25, checks that the
allow-list matches the pinned typings, and fails if the host jar contains any
Graal or Truffle classes.

## Container layout

During development a container is a loose directory:

```
plugins/EffectMC/hello/
  plugin.json
  plugin.mjs
```

`plugin.json`:

```json
{
  "name": "hello",
  "version": "0.1.0",
  "entry": "plugin.mjs"
}
```

`entry` is optional and defaults to `plugin.mjs`. The manifest name must match
the directory name and use lowercase letters, digits, `-` or `_`.

`plugin.mjs` is a bundled ES module. It must default-export the `Plugin` value
and may write to the server log through either `console` or `effectmc`:

```js
console.log("hello from a container");

export default { name: "hello" };
```

Each container gets its own `Context` and its own thread. A JavaScript value
never crosses a Context boundary.

## Java class lookup

Containers are evaluated with

- `allowHostClassLookup` restricted to `allow-list.txt`, and
- public-member access for values reachable from that list.

`Java.type()` for a class outside the list throws inside JavaScript. The
boundary is **which class names may be named**, not which members exist: per
ADR-0013, public members of an allowed class and of values returned from those
members remain reachable. Containers are trusted author artifacts, not an
adversarial sandbox.

The allow-list is generated from `@effectmc/paper-types`; regenerate it with:

```bash
npm run generate:allow-list
```

Curated EffectMC types that are not derivable from Paper typings go in
`allow-list.extra.txt`.

## Graal

Graal is **not** shaded or relocated. `GraalLibraryLoader` is Paper's
`PluginLoader` for this plugin and injects `org.graalvm.polyglot:js` onto the
plugin classpath at startup. The jar task is checked to ensure no
`org/graalvm/**` or `com/oracle/truffle/**` entry ships in the host jar.
