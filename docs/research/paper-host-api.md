# Paper / Brigadier / GraalJS host API — primary-source fact check

**Access date:** 2026-11-03
**Paper version checked:** `paper-api 26.3.build.230-stable` (calendar versioning; `api-version` valid range is `1.13`–`26.3`)
**GraalVM checked:** `graalvm.org/latest` = **GraalVM 25.5 (Innovation)**, LTS line 25.0; GraalJS docs pin `org.graalvm.polyglot` **25.3.4.1**; SDK sources read from `oracle/graal` master (headers "Copyright (c) 2017, 2026"; contains `@since 25.4` APIs, i.e. post-25.3)
**PaperMC docs commit:** `77080af91982c767f3e6f1261ef12eacde1a5ac8` ("Last updated: Sep 18, 2026", all pages touched)
**Brigadier checked:** `Mojang/brigadier` master (`CommandNode.java`, `ArgumentBuilder.java`, `RootCommandNode.java`)

**Citation convention.** Doc URLs are page URLs as served on the access date. Source citations are `repo/path/to/File.java` + the exact symbol (§). Line numbers are given only where the file was read with line numbering (the polyglot SDK files); everywhere else the symbol name is exact and greppable at HEAD. I did not invent line numbers.

---

## Fact sheet

| # | Claim under test | Verdict | Source |
|---|---|---|---|
| 1 | `paper-plugin.yml` `loader:` (Paper `PluginLoader`) still exists and is supported | **CONFIRMED** (marked `@Experimental`) | `PaperPluginMeta` field `loader`; docs `paper-plugins` §Loaders |
| 2 | `PluginLoader` requires `load(JavaPlugin)` | **CONTRADICTED** — the only method is `classloader(PluginClasspathBuilder)`; `load(JavaPlugin)` exists nowhere. `PluginBootstrap.createPlugin(...)` is the nearest thing | `io/papermc/paper/plugin/loader/PluginLoader.java`; `io/papermc/paper/plugin/bootstrap/PluginBootstrap.java` |
| 3 | `libraries:` works in `paper-plugin.yml` | **CONTRADICTED** — `libraries:` / `paper-skip-libraries` are `plugin.yml` (legacy `PluginDescriptionFile`) fields only. Paper plugins add libs via a `PluginLoader` | `PaperPluginMeta` has no libraries field; docs `plugin-yml` §libraries/§paper-skip-libraries |
| 4 | Paper resolves Maven deps at runtime | **CONFIRMED** — Aether-based resolution into the server `libraries/` cache | `MavenLibraryResolver` javadoc §Constructor; docs `paper-plugins` §Loaders |
| 5 | Compile against `paper-api`, run unshaded | **CONFIRMED** | docs `project-setup` `compileOnly("io.papermc.paper:paper-api:26.3.build.+")` |
| 6 | Command registration path is `LifecycleEvents.COMMANDS` → `Commands.register(...)` | **CONFIRMED** | `LifecycleEvents.COMMANDS`; `Commands` javadoc example; docs `command-api/basics/registration` |
| 7 | `Commands.register` returns a `CommandNode` | **CONTRADICTED** — returns `@Unmodifiable Set<String>` (registered root labels incl. aliases + namespaced variants) | `Commands.java` §`register(LiteralCommandNode, String, Collection)` |
| 8 | Command tree shape is fixed at load/registration time | **CONTRADICTED** — `COMMANDS` is a `ReloadableRegistrarEvent` with `Cause.INITIAL`/`Cause.RELOAD`; the dispatcher is rebuilt on reload; nodes are mutable (`addChild` merges and overwrites `command`) | `LifecycleEvents.COMMANDS`; `ReloadableRegistrarEvent`; `PaperCommands.setDispatcher`; `CommandNode.addChild` |
| 9 | `requires` is re-evaluated per dispatch; `updateCommands` resyncs clients | **CONFIRMED** | `ArgumentBuilder.requires(Predicate<S>)`; `Player#updateCommands()`; docs `command-api/basics/requirements` |
| 10 | Paper `ArgumentTypes` resolve to typed values via a resolver object | **CONFIRMED** | `ArgumentTypes.player()` → `ArgumentType<PlayerSelectorArgumentResolver>`; `ArgumentResolver.resolve(CommandSourceStack)` |
| 11 | Sync events dispatch on the main/region thread; async events must not | **CONFIRMED** | `PaperEventManager.callEvent` (throws both ways) |
| 12 | `setCancelled` from a synchronous listener takes effect after return | **CONFIRMED** | `Cancellable` javadoc; `Event.callEvent()` reads `isCancelled()` after dispatch |
| 13 | `AsyncChatEvent` is inherently async | **CONTRADICTED** — "will sometimes fire synchronously" | `AsyncChatEvent` javadoc |
| 14 | Bukkit global scheduler is deprecated | **CONTRADICTED** — `BukkitScheduler` has no class-level `@Deprecated`; only individual legacy methods are | `BukkitScheduler.java` |
| 15 | `EntityScheduler` == Folia's entity-owned region scheduler | **CONFIRMED** | `EntityScheduler` javadoc ("region which owns the entity"); Folia `overview` §EntityScheduler |
| 16 | PDC reads/writes are documented as requiring the main thread | **UNVERIFIED** — no such statement exists; the impl is an unsynchronized `HashMap` with no thread check | `CraftPersistentDataContainer` (no `isPrimaryThread`); docs `pdc` (no thread note) |
| 17 | Nested `TAG_CONTAINER` for structs | **CONFIRMED** | `PersistentDataType.TAG_CONTAINER`; `PersistentDataAdapterContext.newPersistentDataContainer()`; docs `pdc` §Data types |
| 18 | `Location` / `Block` are `PersistentDataHolder` | **CONTRADICTED** — neither implements it. `TileState` does; `Block` only via `getState()` | docs `pdc` §Storing on different objects |
| 19 | `World` is a `PersistentDataHolder` | **CONFIRMED** | `World.java` declaration |
| 20 | `ItemStack` PDC is directly mutable | **CONTRADICTED** — read-only view; mutate via `editPersistentDataContainer` / `ItemMeta` + `setItemMeta` | `ItemStack.java` §`getPersistentDataContainer`, §`editPersistentDataContainer`, §`editMeta` |
| 21 | `CommandSender` is an Adventure `Audience` | **CONFIRMED** | `CommandSender.java` declaration |
| 22 | One `Engine` can serve many `Context`s, on different threads | **CONFIRMED** | `Context` javadoc §Thread-Safety; embed-languages §Code Caching ("engines can always be shared across multiple threads") |
| 23 | A JS `Context` may be used by one thread at a time only | **CONFIRMED** | GraalJS docs §Multithreading rules 1–2 |
| 24 | `HostAccess` alone gives a package allow-list | **CONTRADICTED** — `HostAccess` is member/annotation-scoped; class-name filtering is `Context.Builder.allowHostClassLookup(Predicate<String>)` | `HostAccess.Builder` (no `allowType`/`allowStaticAccess`); `Context.Builder.allowHostClassLookup` |
| 25 | `HostAccess.allowAll` exists as a switch | **CONTRADICTED as named** — it is `HostAccess.ALL` / `allowAllAccess(boolean)` / `allowPublicAccess(boolean)` | `HostAccess` constants; `Context.Builder.allowAllAccess` |
| 26 | An annotation-based allow-list is possible | **CONFIRMED** (`@HostAccess.Export` + `allowAccessAnnotatedBy`) but useless for Paper: Paper API classes are not annotated | `HostAccess` `EXPLICIT` definition |
| 27 | GraalJS provides a host-visible `setTimeout` / event loop | **CONTRADICTED** — no such global in `Context` embeddings; `js.commonjs-require` is experimental and CJS-only | GraalJS docs §JavaScript Modules, §Nashorn |
| 28 | There is a documented way to drain the microtask queue from the host | **UNVERIFIED** — no such API or doc statement found | GraalJS docs §Promises (only `then()`/`await` interop) |
| 29 | Interpreter-only fallback can be detected | **CONFIRMED** — `Engine.supportsCompilation()` (`@since 25.1`) + `getImplementationName()` + engine warning | `Engine.java` §`supportsCompilation`; embed-languages §Runtime Optimization Support |
| 30 | `--experimental-options` is needed for anything in scope | **PARTIALLY TRUE** — required for `js.nashorn-compat`, `js.scripting`, `js.commonjs-require`. Paper-facing code needs none of them | GraalJS docs §Options (2119), §Nashorn, §commonjs-require |
| 31 | Grakkit is GraalVM-based and abandoned | **MIXED** — GraalJS + "designed to run on standard JDK"; not archived, last push 2025-01-05, 12 open issues | `grakkit/grakkit` README; GitHub repo metadata |
| 32 | One Java listener per event type is *required* by Bukkit | **CONTRADICTED** (it is allowed, not required); the real constraint is that `priority`/`ignoreCancelled` are per-`RegisteredListener` | `HandlerList.register`; `RegisteredListener` |

---

## A. Plugin loading

### A.1 `paper-plugin.yml` still has `loader:` — yes, and it is the *only* hook

`PaperPluginMeta` (the `paper-plugin.yml` model) declares exactly:

```java
private String bootstrapper;   // @PluginConfigConstraints.PluginNameSpace
private String loader;         // @PluginConfigConstraints.PluginNameSpace
private List<String> provides = List.of();
private boolean hasOpenClassloader = false;
private Map<PluginDependencyLifeCycle, Map<String, DependencyConfiguration>> dependencies;
static final ApiVersion MINIMUM = ApiVersion.getOrCreateVersion("1.19");
```

Source: `paper-server/src/main/java/io/papermc/paper/plugin/provider/configuration/PaperPluginMeta.java`.

Consequences that matter:

* `api-version` below **1.19 is rejected** for Paper plugins (`MINIMUM` check inside the `ApiVersion` scalar serializer).
* There is **no `libraries` field**. `libraries:` and `paper-skip-libraries:` belong to `plugin.yml`, documented at docs `paper/dev/plugin-yml` §libraries / §paper-skip-libraries ("If `true`, Paper will skip resolution of libraries defined in the `libraries` section. This is useful for delegating library loading to a Paper plugin loader").
* `dependencies` is a map keyed by `PluginDependencyLifeCycle` (`BOOTSTRAP` / `SERVER`) with `load` (`BEFORE|AFTER|OMIT`), `required`, `join-classpath`. Paper plugins **do not** use the legacy `depend` list for load order (docs `paper-plugins` §Load order logic split).

### A.2 `PluginLoader` does **not** have `load(JavaPlugin)`

Exact current interface:

```java
@Experimental
@NullMarked
@OverrideOnly
public interface PluginLoader {
    void classloader(PluginClasspathBuilder classpathBuilder);
}
```

Source: `paper-api/src/main/java/io/papermc/paper/plugin/loader/PluginLoader.java`. Javadoc: *"A plugin loader is responsible for creating certain aspects of a plugin before it is created… This, as of right now, only applies to creating the expected classpath for the plugin"* and *"this class will be called from a different classloader, this will cause any static values set in this class/any other classes loaded not to persist when the plugin loads."*

`load(JavaPlugin)` is not in the API at all. The two nearby methods are:

* `org.bukkit.plugin.PluginLoader` — `@Deprecated(forRemoval=true)`, method `Plugin loadPlugin(File file)`. This is the *legacy* Bukkit loader registry, and `PluginManager.registerInterface` is deprecated with the comment *"The PluginLoader system will not function in the near future"*.
* `io.papermc.paper.plugin.bootstrap.PluginBootstrap#createPlugin(PluginProviderContext) : JavaPlugin` — this is how you control instance creation, not `PluginLoader`.

So the design sentence "Graal loads through the `paper-plugin.yml` `PluginLoader`" is only true in the *classpath* sense: the loader can inject Graal's jars into the plugin's classpath, nothing more. It cannot replace the plugin's own class loading.

**Classloader precedence** (what `PluginLoader` can actually influence):

```java
public interface PluginClasspathBuilder {
    @Contract("_ -> this")
    PluginClasspathBuilder addLibrary(ClassPathLibrary classPathLibrary);
    PluginProviderContext getContext();
}
```

`paper-api/.../plugin/loader/PluginClasspathBuilder.java`. Javadoc: *"As a builder, this method does not invoke `ClassPathLibrary.register(LibraryStore)` and may hence be run without invoking potential IO performed by a `ClassPathLibrary` during resolution."*

Available library types, per docs `paper-plugins` §Loaders: `JarLibrary` and `MavenLibraryResolver`. Everything added lands on the plugin's classpath **after** the plugin's own jar, so a plugin jar that *contains* a class wins over a library — this is the mechanism by which "don't shade Graal" and "don't ship a conflicting copy" stay compatible.

### A.3 Maven resolution at runtime — yes, with a mandatory mirror

```java
public class MavenLibraryResolver implements ClassPathLibrary {
    public static final String MAVEN_CENTRAL_DEFAULT_MIRROR;
    public MavenLibraryResolver();                       // no repositories pre-registered
    public void addDependency(Dependency dependency);
    public void addRepository(RemoteRepository remoteRepository);
    public void register(LibraryStore store) throws LibraryLoadingException;
}
```

`paper-api/.../plugin/loader/library/impl/MavenLibraryResolver.java`. Verbatim from the javadoc:

> "The created instance will use the servers libraries folder to cache fetched libraries in. Notably, the resolver is created without any repository, not even maven central."

Docs `paper-plugins` §Loaders add: *"If you wish to resolve libraries from Maven Central, use a mirror, as using Maven Central directly as a CDN is against the Maven Central Terms of Service… Using the Maven Central repository (i.e. `*.maven.org` or `*.maven.apache.org`) will cause a warning to be shown in the console."*

**Can it carry GraalJS's jars?** Mechanically yes — `addDependency(new Dependency(new DefaultArtifact("org.graalvm.polyglot:js-community:25.3.4.1"), null))` plus the mirror repository. Two constraints from GraalVM's own docs:

* The language artifact is a **`pom`** aggregator; the real jars are transitive (`docs`: *"The `pom` type is a requirement for language or tool dependencies"*).
* GraalVM explicitly discourages fat jars: *"We discourage bundling all dependencies into a single 'fat' JAR … Instead, we recommend using the original, separate JAR files for all `org.graalvm.*` dependencies, preferably on the module path."* (GraalJS docs §Getting Started; embed-languages §Dependency Setup).

Whether a Paper `MavenLibraryResolver`-provided classpath satisfies Truffle's named-module assumptions is **UNVERIFIED** — no Paper doc and no GraalVM doc addresses "classpath-only polyglot on a Paper plugin classloader". Treat "we can just resolve Graal from Maven at runtime" as an untested assumption.

### A.4 `paper-api` coordinates

```kotlin
repositories { maven(url = "https://repo.papermc.io/repository/maven-public/") { name = "papermc" } }
dependencies { compileOnly("io.papermc.paper:paper-api:26.3.build.+") }
java { toolchain.languageVersion.set(JavaLanguageVersion.of(25)) }
```

docs `paper/dev/project-setup` §Adding Paper as a dependency. Build-pinned form is `{VERSION}.build.25-stable` (example given in docs); the version string format changed at 26.1 (before: `1.21.11-R0.1-SNAPSHOT`). `compileOnly` + no shading is correct because the server provides `paper-api` at runtime — that is the whole premise of the artifact being `compileOnly` in the official guide.

---

## B. Brigadier on Paper

### B.1 Registration path (exact, current)

```java
public final class LifecycleEvents {
    public static final LifecycleEventType.Prioritizable<LifecycleEventOwner, ReloadableRegistrarEvent<Commands>> COMMANDS
        = prioritized("commands", LifecycleEventOwner.class);
}
```

`paper-api/.../plugin/lifecycle/event/types/LifecycleEvents.java`.

```java
public interface LifecycleEventManager<O extends LifecycleEventOwner> {
    default <E extends LifecycleEvent> void registerEventHandler(
        LifecycleEventType<? super O, ? extends E, ?> eventType,
        LifecycleEventHandler<? super E> eventHandler) { ... }
    void registerEventHandler(LifecycleEventHandlerConfiguration<? super O> handlerConfiguration);
}
```

Two owners: `Plugin#getLifecycleManager()` and `BootstrapContext#getLifecycleManager()`. The event object is a `ReloadableRegistrarEvent<Commands>`:

```java
public interface ReloadableRegistrarEvent<R extends Registrar> extends RegistrarEvent<R> {
    Cause cause();
    enum Cause { INITIAL, RELOAD }
}
```

```java
public interface Commands extends Registrar {
    static LiteralArgumentBuilder<CommandSourceStack> literal(final String literal);
    static <T> RequiredArgumentBuilder<CommandSourceStack, T> argument(final String name, final ArgumentType<T> argumentType);
    CommandDispatcher<CommandSourceStack> getDispatcher();
    @Unmodifiable Set<String> register(LiteralCommandNode<CommandSourceStack> node,
                                        @Nullable String description,
                                        Collection<String> aliases);
    @Unmodifiable Set<String> register(PluginMeta pluginMeta,
                                        LiteralCommandNode<CommandSourceStack> node,
                                        @Nullable String description,
                                        Collection<String> aliases);
    @Unmodifiable Set<String> register(String label, @Nullable String description,
                                        Collection<String> aliases, BasicCommand basicCommand);
    // + default overloads that drop description and/or aliases
}
```

`paper-api/src/main/java/io/papermc/paper/command/brigadier/Commands.java`.

`Registrar` is an **empty marker interface**:

```java
@ApiStatus.NonExtendable
public interface Registrar { }
```

`paper-api/.../plugin/lifecycle/event/registrar/Registrar.java`. **There is no `unregister` on `Commands`.** Teardown is either "re-registration on reload" or "remove the node from the dispatcher yourself via `getDispatcher().getRoot()`".

### B.2 Is the tree shape fixed at load time? No.

Three independent facts:

1. The event is **reloadable**: `ReloadableRegistrarEvent.Cause { INITIAL, RELOAD }`. Docs `command-api/basics/registration` states it plainly: *"whatever we register using the `LifecycleEventManager`, will be reregistered each time it is required."*
2. The dispatcher is **rebuilt**, not amended: `PaperCommands.setDispatcher(...)` constructs `new CommandDispatcher<>(new ApiMirrorRootNode() {...})` and re-points `this.dispatcher`. On reload `invalidate()` sets `invalid = true` and `getDispatcher()` throws `Preconditions.checkState(!this.invalid …)`.
3. Brigadier nodes are **mutable**. `CommandNode`:

```java
private final Map<String, CommandNode<S>> children = new LinkedHashMap<>();
private Command<S> command;

public void addChild(final CommandNode<S> node) {
    ...
    final CommandNode<S> child = children.get(node.getName());
    if (child != null) {
        if (node.getCommand() != null) {
            child.command = node.getCommand();     // merge: overwrite the live executor
        }
        for (final CommandNode<S> grandchild : node.getChildren()) {
            child.addChild(grandchild);
        }
    } else { ... }
}
```

`Mojang/brigadier/src/main/java/com/mojang/brigadier/tree/CommandNode.java`. Note `command` is non-final and reassigned by `addChild` on collision.

**The nuance that makes "hot-swap via lookup table" work anyway:** Paper does *not* put your node object into the dispatcher verbatim. It copies:

```java
public static <S> LiteralCommandNode<S> copyLiteral(final String newLiteral, final LiteralCommandNode<S> source) {
    final LiteralArgumentBuilder<S> copyBuilder = LiteralArgumentBuilder.<S>literal(newLiteral)
        .requires(source.getRequirement())
        .forward(source.getRedirect(), source.getRedirectModifier(), source.isFork());
    if (source.getCommand() != null) {
        copyBuilder.executes(source.getCommand());
    }
    for (final CommandNode<S> child : source.getChildren()) {
        copyBuilder.then(child);
    }
    return copyBuilder.build();
}
```

`paper-server/src/main/java/io/papermc/paper/command/brigadier/PaperBrigadier.java`. Both the namespaced variant and the plain literal are registered (`PaperCommands.registerWithFlagsInternal`), and the *executor object* is copied by reference. Therefore: **mutating your builder after `register(...)` does nothing; mutating a closure captured by the executor does everything.** That is exactly the "handler lookup table" pattern — it is sound, but for a different reason than "the tree is frozen".

Also observable: `PaperCommands.registerIntoDispatcher` calls `this.getDispatcher().getRoot().removeCommand(...)` and sets `node.apiCommandMeta = meta`. Neither `removeCommand` nor `apiCommandMeta` exists in `Mojang/brigadier` master, so Paper's bundled Brigadier is **patched**. Do not assume upstream Brigadier semantics.

Registration behaviour, verbatim from `Commands#register` javadoc:

> * Aliases will not override already existing commands (excluding namespaced ones)
> * Aliases are **not** Brigadier redirects, they just copy the command to a different label
> * The main command/namespaced label will override already existing commands

### B.3 Permissions and re-checking

```java
public T requires(final Predicate<S> requirement);   // ArgumentBuilder
public boolean canUse(final S source) { return requirement.test(source); }  // CommandNode
```

`ArgumentBuilder.java` / `CommandNode.java`. For Paper, `S = CommandSourceStack`, so `requires(stack -> stack.getSender().hasPermission("x"))` is the documented form (docs `command-api/basics/requirements`).

Re-running after a permission change is a **client resync**, not a server re-evaluation: the predicate is called on every parse/suggest anyway, but the client's command graph is cached. The documented fix:

```java
player.updateCommands();
```

`Player#updateCommands()` — docs `requirements` §Automating command reloads: *"It is safe to call the update commands method as often as required, but it should generally be avoided as it can cost a great deal of bandwidth… this method is completely thread safe, meaning you are free to call it from an asynchronous context."*

There is no `ServerCommandMap.updateCommands()` equivalent for Brigadier in `io.papermc.paper.command.brigadier`; `updateCommands` on the Bukkit `CommandMap` is the legacy path only.

`CommandSourceStack` (verbatim members):

```java
Location getLocation();                 // "a cloned location instance"
CommandSender getSender();
@Nullable Entity getExecutor();
Player getPlayerOrThrow() throws CommandSyntaxException;
Entity getEntityOrThrow() throws CommandSyntaxException;
CommandSourceStack withLocation(Location location);
CommandSourceStack withExecutor(Entity executor);
void sendReply(ComponentLike message);
void sendSuccess(ComponentLike message, boolean allowInformingAdmins);
void sendFailure(ComponentLike message);
default void sendRichReply(String message, TagResolver... resolvers);
```

Javadoc caveat that matters for a scripting host: *"The `CommandSender` returned by `getSender()` may be a 'no-op' instance of `CommandSender` in cases where the server either doesn't exist yet, or no specific sender is available. Methods on such a `CommandSender` will either have no effect or throw an `UnsupportedOperationException`."*

### B.4 `ArgumentTypes` and how resolved values reach the executor

`ArgumentTypes` is a static factory over `VanillaArgumentProvider`. The ones that matter:

```java
public static ArgumentType<EntitySelectorArgumentResolver> entity();
public static ArgumentType<EntitySelectorArgumentResolver> entities();
public static ArgumentType<PlayerSelectorArgumentResolver> player();
public static ArgumentType<PlayerSelectorArgumentResolver> players();
public static ArgumentType<PlayerProfileListResolver> playerProfiles();
public static ArgumentType<BlockPositionResolver> blockPosition();
public static ArgumentType<FinePositionResolver> finePosition();      // + finePosition(boolean centerIntegers)
public static ArgumentType<RotationResolver> rotation();
public static ArgumentType<World> world();
public static ArgumentType<NamespacedKey> namespacedKey();
public static ArgumentType<Key> key();
public static <T> ArgumentType<T> resource(RegistryKey<T> registryKey);
public static <T> ArgumentType<TypedKey<T>> resourceKey(RegistryKey<T> registryKey);
public static ArgumentType<IntegerRangeProvider> integerRange();
public static ArgumentType<DoubleRangeProvider> doubleRange();
public static ArgumentType<ItemStack> itemStack();
public static ArgumentType<BlockState> blockState();
public static ArgumentType<Component> component();
public static ArgumentType<Integer> time(int mintime);
```

`paper-api/.../command/brigadier/argument/ArgumentTypes.java`. There is **no** `ArgumentTypes.resourceLocation()`; the resource-location equivalent is `resource(RegistryKey)` / `key()` / `namespacedKey()`.

Two-step resolution is mandatory for the resolver-typed arguments:

```java
Commands.argument("target", ArgumentTypes.player())
    .executes(context -> {
        final PlayerSelectorArgumentResolver resolver =
            context.getArgument("target", PlayerSelectorArgumentResolver.class);
        final Player target = resolver.resolve(context.getSource()).getFirst();
        ...
    })
```

Docs `command-api/arguments/entity-player` §Player argument. Signature: `ArgumentResolver#resolve(CommandSourceStack)`; `EntitySelectorArgumentResolver` yields `List<Entity>`, `PlayerSelectorArgumentResolver` yields `List<Player>`, `BlockPositionResolver` yields a block position.

Non-resolver arguments (e.g. `ItemStack`, `World`, `NamespacedKey`, `Integer` via `IntegerArgumentType`) are read straight off the context: `context.getArgument("item", ItemStack.class)` / `IntegerArgumentType.getInteger(context, "amount")` (docs `command-api/basics/executors`, `argument-suggestions`).

`CommandContext<CommandSourceStack>` → typed Java: `S getSource()` and `V getArgument(String, Class<V>)` are the only two documented accessors (docs `executors` §Examining the executes method).

### B.5 Suggestions

```java
@FunctionalInterface
public interface SuggestionProvider<S> {
    CompletableFuture<Suggestions> getSuggestions(CommandContext<S> context, SuggestionsBuilder builder)
        throws CommandSyntaxException;
}
```

Docs `command-api/basics/argument-suggestions`. Registered with `.suggests(SuggestionProvider<CommandSourceStack>)` on the argument builder. `SuggestionsBuilder` API: `getInput()`, `getStart()`, `getRemaining()`, `getRemainingLowerCase()`, `suggest(String|int)`, `suggest(String|int, Message)`, `build()`, `buildFuture()`.

Two behaviours with real API consequences:

* **Threading.** The Paper docs show two forms side by side and annotate them: the direct form is *"Here, you are safe to use all Paper API"*; `CompletableFuture.supplyAsync(() -> …)` is *"Here, most Paper API is not usable"*. Suggestions are therefore **synchronous on the caller's thread by default**. Nothing in Paper moves Brigadier suggestion providers off the server thread.
* `AsyncTabCompleteEvent` (`com.destroystokyo.paper.event.server`) **is** async (`super(true)`) but it is the *legacy/Bukkit tab-complete* interception point: *"If this event provides completions, then the standard synchronous process will not be fired to populate the results."* It is not a hook into Brigadier `SuggestionProvider`.

---

## C. Event model

### C.1 Names and signatures

| Thing | Exact name | Note |
|---|---|---|
| Priority enum | `org.bukkit.event.EventPriority` | `LOWEST(0) … MONITOR(5)`, `getSlot()` |
| Marker | `org.bukkit.event.Listener` | empty marker |
| Callback | `org.bukkit.plugin.EventExecutor#execute(Listener, Event)` | functional |
| Registry | `org.bukkit.event.HandlerList` | one static list per event class, discovered reflectively via `static getHandlerList()` |
| Registration (annotation) | `PluginManager#registerEvents(Listener, Plugin)` | scans `@EventHandler` methods |
| Registration (programmatic) | `PluginManager#registerEvent(Class<? extends Event>, Listener, EventPriority, EventExecutor, Plugin[, boolean ignoreCancelled])` | |
| Async flag | `Event#isAsynchronous()` → `public final boolean` | set only via `Event(boolean isAsync)` |
| Cancellation | `org.bukkit.event.Cancellable#isCancelled()/setCancelled(boolean)` | |

```java
public @interface EventHandler {
    EventPriority priority() default EventPriority.NORMAL;
    boolean ignoreCancelled() default false;
}
```

There is **no** `EventRegistration` type in `org.bukkit.event` at 26.3; `@EventHandler` + `registerEvents` is the annotation path, `registerEvent` is the programmatic path, and `RegisteredListener` is the internal pairing of `(listener, executor, priority, plugin, ignoreCancelled)`.

### C.2 Synchronous cancel window — this is real

`setCancelled` is a plain field write on the event object:

```java
public interface Cancellable {
    boolean isCancelled();
    void setCancelled(boolean cancel);   // "A cancelled event will not be executed in the server,
                                         //  but will still pass to other plugins."
}
```

The server reads the flag **after** the whole dispatch unwinds:

```java
public boolean callEvent() {
    Bukkit.getPluginManager().callEvent(this);
    if (this instanceof Cancellable) {
        return !((Cancellable) this).isCancelled();
    } else { return true; }
}
```

`Event.java`. So a JS callback executed *inside* the `EventExecutor`, on the dispatching thread, that flips the flag before returning genuinely cancels. Once the listener returns, flipping the flag is a no-op on the outcome — the server has already made its decision. There is no exception, no warning, no effect. This is the correct justification for a `SyncWindow`: it is not a Paper feature, it is a consequence of "the value is read after dispatch".

`ignoreCancelled` is enforced per registration, at dispatch time, not at registration time:

```java
public void callEvent(final Event event) throws EventException {
    if (event instanceof Cancellable) {
        if (((Cancellable) event).isCancelled() && isIgnoringCancelled()) {
            return;
        }
    }
    executor.execute(listener, event);
}
```

`RegisteredListener.java`. Note it reads `isCancelled()` *at the moment this listener is reached*, so priority ordering is what makes `ignoreCancelled` meaningful: a `LOWEST` listener sees the event uncancelled, a `MONITOR` listener sees the final state.

### C.3 Interleaving across plugins

Dispatch is a single flat loop over one `RegisteredListener[]` per event class:

```java
for (RegisteredListener registration : listeners) {
    if (!registration.getPlugin().isEnabled()) continue;
    try { registration.callEvent(event); } catch (Throwable ex) { ... }
}
```

`PaperEventManager.callEvent`. The array is baked from six per-priority `ArrayList`s (`HandlerList.bake()`), and `bakeAll()`/`bake()` is invalidated on every register/unregister. Therefore ordering is: **priority slot (0→5), then insertion order within the slot, across all plugins**, with no per-plugin grouping. Java and script listeners interleave exactly as two Java plugins would.

Also relevant to a host that registers listeners dynamically:

> "Any newly registered or unregistered handler is ignored after an event starts execution."

`Event.isAsynchronous()` javadoc. The baked array is snapshotted before iteration.

### C.4 Thread enforcement

```java
public void callEvent(@NotNull Event event) {
    if (event.isAsynchronous() && this.server.isPrimaryThread()) {
        throw new IllegalStateException(event.getEventName() + " may only be triggered asynchronously.");
    } else if (!event.isAsynchronous() && !this.server.isPrimaryThread() && !this.server.isStopping()) {
        throw new IllegalStateException(event.getEventName() + " may only be triggered synchronously.");
    }
    ...
}
```

`paper-server/src/main/java/io/papermc/paper/plugin/manager/PaperEventManager.java`. This is the strongest available statement about *where* listeners run: a sync event's listeners run on the primary thread (or on the stopping path); an async event's listeners must not be on it.

### C.5 Which events are inherently async

* `AsyncPlayerPreLoginEvent` — **inherently async**. Constructed `super(true)`; javadoc: *"This event is asynchronous, and not run using main thread."* Illegal on it: anything touching the world/entities/registry (no player exists yet); it also carries no locale (see javadoc note about `GlobalTranslator`).
* `AsyncChatEvent` — **sometimes async**. Javadoc verbatim: *"This event will sometimes fire synchronously, depending on how it was triggered. If a player is the direct cause of this event by an incoming packet, this event will be asynchronous. If a plugin triggers this event by compelling a player to chat, this event will be synchronous. Care should be taken to check `#isAsynchronous()` and treat the event appropriately."* Constructed via `super(async, …)` — the boolean is a constructor parameter, not a constant.
* `AsyncTabCompleteEvent` — async (`super(true)`), see above.

Anything that is `new Event(true)` is a runtime landmine for a host that assumes "async ⇒ always off-main": your `Events.of(AsyncChatEvent)` stream will be invoked on the main thread whenever another plugin forces chat, and your `AsyncThread` capability will then be lying.

---

## D. Threading / schedulers

### D.1 Four schedulers, exact methods

`BukkitScheduler` (global, still fine on Paper, **not** deprecated at type level — only legacy overloads are, e.g. `scheduleAsyncDelayedTask` `@Deprecated(since="1.4.5")`):

```java
@NotNull BukkitTask runTask(@NotNull Plugin plugin, @NotNull Runnable task);
@NotNull BukkitTask runTaskLater(@NotNull Plugin plugin, @NotNull Runnable task, long delay);
@NotNull BukkitTask runTaskTimer(@NotNull Plugin plugin, @NotNull Runnable task, long delay, long period);
@NotNull BukkitTask runTaskAsynchronously(@NotNull Plugin plugin, @NotNull Runnable task);
@NotNull BukkitTask runTaskLaterAsynchronously(@NotNull Plugin plugin, @NotNull Runnable task, long delay);
@NotNull BukkitTask runTaskTimerAsynchronously(@NotNull Plugin plugin, @NotNull Runnable task, long delay, long period);
@NotNull java.util.concurrent.Executor getMainThreadExecutor(@NotNull Plugin plugin);
```

`RegionScheduler` (location-owned region):

```java
void execute(@NotNull Plugin plugin, @NotNull World world, int chunkX, int chunkZ, @NotNull Runnable run);
void execute(@NotNull Plugin plugin, @NotNull Location location, @NotNull Runnable run);
@NotNull ScheduledTask run(@NotNull Plugin plugin, @NotNull World world, int chunkX, int chunkZ, @NotNull Consumer<ScheduledTask> task);
@NotNull ScheduledTask run(@NotNull Plugin plugin, @NotNull Location location, @NotNull Consumer<ScheduledTask> task);
@NotNull ScheduledTask runDelayed(@NotNull Plugin plugin, @NotNull World world, int chunkX, int chunkZ, @NotNull Consumer<ScheduledTask> task, long delayTicks);
@NotNull ScheduledTask runDelayed(@NotNull Plugin plugin, @NotNull Location location, @NotNull Consumer<ScheduledTask> task, long delayTicks);
@NotNull ScheduledTask runAtFixedRate(@NotNull Plugin plugin, @NotNull World world, int chunkX, int chunkZ, @NotNull Consumer<ScheduledTask> task, long initialDelayTicks, long periodTicks);
@NotNull ScheduledTask runAtFixedRate(@NotNull Plugin plugin, @NotNull Location location, @NotNull Consumer<ScheduledTask> task, long initialDelayTicks, long periodTicks);
```

`EntityScheduler` (entity-owned region, follows teleports):

```java
boolean execute(@NotNull Plugin plugin, @NotNull Runnable run, @Nullable Runnable retired, long delay);
@Nullable ScheduledTask run(@NotNull Plugin plugin, @NotNull Consumer<ScheduledTask> task, @Nullable Runnable retired);
@Nullable ScheduledTask runDelayed(@NotNull Plugin plugin, @NotNull Consumer<ScheduledTask> task, @Nullable Runnable retired, long delayTicks);
@Nullable ScheduledTask runAtFixedRate(@NotNull Plugin plugin, @NotNull Consumer<ScheduledTask> task, @Nullable Runnable retired, long initialDelayTicks, long periodTicks);
```

`AsyncScheduler` (tick-independent; note **`TimeUnit`, not ticks**):

```java
@NotNull ScheduledTask runNow(@NotNull Plugin plugin, @NotNull Consumer<ScheduledTask> task);
@NotNull ScheduledTask runDelayed(@NotNull Plugin plugin, @NotNull Consumer<ScheduledTask> task, long delay, @NotNull TimeUnit unit);
@NotNull ScheduledTask runAtFixedRate(@NotNull Plugin plugin, @NotNull Consumer<ScheduledTask> task, long initialDelay, long period, @NotNull TimeUnit unit);
void cancelTasks(@NotNull Plugin plugin);
```

`GlobalRegionScheduler` exists too: `execute`, `run`, `runDelayed`, `runAtFixedRate` (`long delayTicks`).

Note the return-type split: the region/global schedulers always return a `ScheduledTask`, while `EntityScheduler` returns `null` when the entity is already retired — and `EntityScheduler.execute` returns `boolean` with the same meaning.

### D.2 Recommendation and deprecation status

* The word "deprecated" does **not** apply to `BukkitScheduler`. `paper-api/src/main/java/org/bukkit/scheduler/BukkitScheduler.java` has no class-level `@Deprecated`.
* The docs page `paper/dev/scheduler` is explicitly scoped: *"This guide is designed for non-Folia Bukkit servers. If you are using Folia, you should use its respective schedulers."*
* The cross-platform recommendation is on `paper/dev/folia-support` §Schedulers: *"In order to support Paper and Folia, you must use the correct scheduler… If you use these schedulers when running Paper, they will be internally handled to provide the same functionality as if you were running Folia."*
* Folia opt-in check: `ServerBuildInfo.buildInfo().isBrandCompatible(Key.key("papermc","folia"))`, plus `folia-supported: true` in the plugin descriptor.

### D.3 Threads

| Work | Thread | Source |
|---|---|---|
| Sync scheduler task | main server thread ("executed by the main server thread") | `BukkitScheduler` javadoc; docs `scheduler` §Synchronous tasks |
| Async scheduler task | scheduler-managed thread, still **started** from main ("still started from the main thread and will be affected if the server is lagging") | docs `scheduler` §Asynchronous tasks; `BukkitScheduler.runTaskAsynchronously` javadoc |
| Sync event listeners | primary thread (enforced) | `PaperEventManager.callEvent` |
| Async event listeners | not the primary thread (enforced) | same |
| `RegionScheduler` / `EntityScheduler` body | the thread that owns that region | `RegionScheduler`/`EntityScheduler` javadoc; Folia `overview` §Intra-region operations |
| Command executor | **not documented** | see below |

For "what thread does a command executor run on", there is **no primary-source sentence**. What the sources do give:

* `CommandSourceStack.getLocation()` returns *"a cloned location instance"* and `getSender()` may be a no-op sender when *"the server either doesn't exist yet"* — i.e. commands are not definitionally bound to a live server thread (bootstrap registration exists so datapack functions can parse them).
* `EntityScheduler` javadoc: *"It is guaranteed that the run and retired callback are invoked on the region which owns the entity."* Commands do not come through that scheduler.
* On Folia the relevant thread is the region that owns the sender/executor, not "main".

Verdict: "commands execute with `Main`" is an **UNVERIFIED assumption**. It happens to hold for player-issued commands on Paper (packet handling runs on the primary thread) but Paper never states it, and the bootstrap-registered-command path plus Folia both break it as a universal rule.

### D.4 Folia's region model vs `EntityScheduler`

Yes, same API shape, and the ownership is explicit:

> "The `EntityScheduler` allows tasks to be scheduled to be executed on the region that owns the entity. This is particularly useful when dealing with entity teleportation, as once an entity begins an asynchronous teleport the entity cannot tick until the teleport has completed, and the timing is undefined."

Folia docs `folia/reference/overview` §`EntityScheduler`.

> "The region task scheduler can be used to schedule tasks by location to be executed on the region which owns the location. **Note**: It is entirely inappropriate to use the region scheduler to schedule tasks for entities… the entity scheduler will 'follow' an entity if it is teleported, whereas the region task scheduler will not."

`RegionScheduler.java` class javadoc.

> "regions have their own data object that may only be accessed while ticking the region and by the thread ticking the region"

Folia `overview` §Rules for independent regions. That single sentence is the actual justification for any `Main` capability: mutating region-owned data from another thread is illegal *because the data object is not shared*, not because Bukkit has a thread check.

---

## E. Persistent data

### E.1 Split interface: view vs mutable

```java
public interface PersistentDataContainer extends io.papermc.paper.persistence.PersistentDataContainerView {
    <P, C> void set(@NotNull NamespacedKey key, @NotNull PersistentDataType<P, C> type, @NotNull C value);
    void remove(@NotNull NamespacedKey key);
    void readFromBytes(byte[] bytes, boolean clear) throws java.io.IOException;
    // + PersistentDataKey overloads
}
```

Read side (this is where `get`/`has`/`getKeys`/`isEmpty` actually live):

```java
public interface PersistentDataContainerView {
    <P, C> boolean has(NamespacedKey key, PersistentDataType<P, C> type);
    boolean has(NamespacedKey key);
    <P, C> @Nullable C get(NamespacedKey key, PersistentDataType<P, C> type);
    <P, C> C getOrDefault(NamespacedKey key, PersistentDataType<P, C> type, C defaultValue);
    @Nullable PersistentDataType<?, ?> getPrimitiveStorageType(Key key);
    Set<NamespacedKey> getKeys();
    boolean isEmpty();
    void copyTo(PersistentDataContainer other, boolean replace);
    PersistentDataAdapterContext getAdapterContext();
    byte[] serializeToBytes() throws java.io.IOException;
    int getSize();
}
```

`PersistentDataContainer.java`, `io/papermc/paper/persistence/PersistentDataContainerView.java`.

`get` javadoc is precise about failure modes: returns `null` if absent; throws `IllegalArgumentException` if *"a value exists under the given key, but cannot be accessed using the given type"*. So "decode failure" is an exception, not a null — a `PdcDecodeError` mapping is a reasonable design, but the underlying behaviour is `IllegalArgumentException`.

`has(key, type)` compares the **primitive** type: *"Storing a value using a custom `PersistentDataType` implementation will not store the complex data type. Therefore storing a UUID (by storing a `byte[]`) will match `has("key", PersistentDataType.BYTE_ARRAY)`."* That is a real footgun for Schema-encoded types: `has(key, HomeType)` only works if `HomeType.getPrimitiveType()` is itself the stored tag type and `TAG_CONTAINER`'s adapter is used consistently.

`PersistentDataHolder`:

```java
public interface PersistentDataHolder extends io.papermc.paper.persistence.PersistentDataViewHolder {
    @NotNull PersistentDataContainer getPersistentDataContainer();
}
```

Its javadoc adds the recommendation: *"Prefer using `PersistentDataViewHolder` for read-only operations as it covers more types."*

### E.2 Built-in `PersistentDataType` constants (complete)

From `paper-api/src/main/java/org/bukkit/persistence/PersistentDataType.java`:

| Constant | Primitive `P` | Complex `C` | Notes |
|---|---|---|---|
| `BYTE` | `Byte` | `Byte` | |
| `SHORT` | `Short` | `Short` | |
| `INTEGER` | `Integer` | `Integer` | |
| `LONG` | `Long` | `Long` | |
| `FLOAT` | `Float` | `Float` | |
| `DOUBLE` | `Double` | `Double` | |
| `BOOLEAN` | `Byte` | `Boolean` | *not* a primitive; stored as byte, `!= 0` is true |
| `STRING` | `String` | `String` | |
| `BYTE_ARRAY` | `byte[]` | `byte[]` | |
| `INTEGER_ARRAY` | `int[]` | `int[]` | |
| `LONG_ARRAY` | `long[]` | `long[]` | |
| `TAG_CONTAINER_ARRAY` | `PersistentDataContainer[]` | `PersistentDataContainer[]` | `@Deprecated(since="1.20.4")` → use `LIST.dataContainers()` |
| `TAG_CONTAINER` | `PersistentDataContainer` | `PersistentDataContainer` | nested container |
| `LIST` | — | — | `ListPersistentDataTypeProvider`, **not** a `PersistentDataType` (see javadoc) |

There is no `UUID`, no `ItemStack`, no `Location` built-in. UUIDs are the canonical "write your own `PersistentDataType<byte[], UUID>`" example in both the interface javadoc and docs `pdc` §Custom data types.

Hard constraint on custom types, verbatim: *"Any plugin owned implementation of this interface is required to define one of the existing primitive types found in this interface."*

`LIST` usage (docs `pdc` §Data types):

```java
container.set(key, PersistentDataType.LIST.listTypeFrom(PersistentDataType.STRING), List.of("a","b"));
container.set(key, PersistentDataType.LIST.strings(), List.of("a","b"));
List<String> strings = container.get(key, PersistentDataType.LIST.strings());
```

### E.3 Nested containers

```java
public interface PersistentDataAdapterContext {
    @NotNull PersistentDataContainer newPersistentDataContainer();
}
```

Yes, a container can hold another container: `TAG_CONTAINER` maps `PersistentDataContainer → PersistentDataContainer`, and docs `pdc` describe *"Tag Containers — a way to nest PDCs within each other"* with exactly this construction:

```java
PersistentDataContainer newContainer = container.getAdapterContext().newPersistentDataContainer();
```

The serialized form is an NBT compound, so nesting depth is bounded only by NBT/packet limits; **no documented depth limit** exists (UNVERIFIED for stack depth of a recursive Schema codec).

Caveat for a Schema-mapped struct: the nested container's own adapter context is the same registry, so a `Home` type stored as `TAG_CONTAINER` round-trips only if every field's type is itself resolvable by that registry. Nothing prevents a container from containing a container that contains the same container object — but `CraftPersistentDataContainer.equals` compares raw tag maps and `copyTo` does `putAll` on the raw map, so cycles are *not* a concern at the API level, only at serialization.

### E.4 What actually implements / holds a PDC

Documented list (docs `pdc` §Storing on different objects):

| Type | Accessor | Mutable? |
|---|---|---|
| `ItemStack` | `getPersistentDataContainer()` | **no** — `PersistentDataContainerView` only; use `editPersistentDataContainer(Consumer)` |
| `Chunk` | `getPersistentDataContainer()` | yes |
| `World` | `getPersistentDataContainer()` | yes |
| `Entity` | `getPersistentDataContainer()` | yes |
| `TileState` | `getPersistentDataContainer()` (cast `block.getState()`) | yes |
| `Structure` | `getPersistentDataContainer()` | yes |
| `GeneratedStructure` | `getPersistentDataContainer()` | yes |
| `Raid` | `getPersistentDataContainer()` | yes |
| `OfflinePlayer` | `getPersistentDataContainer()` | **no** (read-only, disk-backed) |
| `ItemMeta` | `getPersistentDataContainer()` | yes, but on a *snapshot* |

`World` verified in source: `public interface World extends RegionAccessor, WorldInfo, PluginMessageRecipient, Metadatable, PersistentDataHolder, Keyed, net.kyori.adventure.audience.ForwardingAudience` (`World.java`).

**`Location` is not a holder. `Block` is not a holder.** `Block` only reaches a PDC through `block.getState()` when that state is a `TileState`. A design that accepts "any `PersistentDataHolder`" cannot accept `Location` or `Block` without an adapter.

Also documented, and easy to get wrong: *"Data is **not** copied across holders for you… Placing an ItemStack as a Block (with a TileState) **does not** copy over PDC data."*

### E.5 ItemMeta / setItemMeta

`ItemMeta` is a snapshot. `ItemStack#editMeta(Consumer)` makes the contract explicit in source:

```java
public <M extends ItemMeta> boolean editMeta(final @NotNull Class<M> metaClass,
                                             final @NotNull java.util.function.Consumer<@NotNull ? super M> consumer) {
    final @Nullable ItemMeta meta = this.getItemMeta();
    if (metaClass.isInstance(meta)) {
        consumer.accept((M) meta);
        this.setItemMeta(meta);
        return true;
    }
    return false;
}
```

`ItemStack.java`. So `meta.getPersistentDataContainer().set(...)` **alone is a no-op**; `setItemMeta(meta)` must follow. Same for the PDC path on items:

```java
public boolean editPersistentDataContainer(@NotNull Consumer<PersistentDataContainer> consumer);
```

javadoc: *"The `PersistentDataContainer` instance is only valid inside the consumer"* and it returns `false` for *"empty or invalid itemstacks"*. Docs `pdc` add: *"The persistent data container available in the consumer is not valid outside the consumer."*

### E.6 Thread restrictions on PDC

**None documented.** Three checks:

* `PersistentDataContainer` / `PersistentDataContainerView` javadoc: no thread mention anywhere.
* `CraftPersistentDataContainer` (the implementation) has **no** `isPrimaryThread` / `Preconditions.checkState` on thread; it is a `HashMap<String, Tag>` with `set`/`remove`/`getKeys`/`isEmpty`/`copyTo` operating directly on it.
* docs `pdc`: no thread section at all.

The real constraint is inherited from the *holder*: an `Entity`/`World`/`TileState` PDC is region-owned state (Folia `overview`: region data *"may only be accessed while ticking the region and by the thread ticking the region"*), so writing it off-thread is a data race, not a caught error. An `ItemStack`/`ItemMeta` PDC is a detached object with no owning thread at all — requiring `Main` for item PDC is strictly stronger than Paper requires.

Practical consequence: because the container itself has no synchronization, concurrent reads from an async event while the main thread writes are a genuine `HashMap` race with no diagnostic. That *does* justify a thread capability — but as a design decision, not as a Paper rule.

---

## F. Adventure / text

Exact packages (all `net.kyori.adventure.*`, shipped by Paper):

| Type | FQN |
|---|---|
| `Audience` | `net.kyori.adventure.audience.Audience` |
| `ForwardingAudience` | `net.kyori.adventure.audience.ForwardingAudience` |
| `Component` | `net.kyori.adventure.text.Component` |
| `MiniMessage` | `net.kyori.adventure.text.minimessage.MiniMessage` |
| `TagResolver` | `net.kyori.adventure.text.minimessage.tag.resolver.TagResolver` |
| Legacy bridge | `net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer` |
| `SignedMessage` / `ChatType` | `net.kyori.adventure.chat.*` |

`CommandSender` is an `Audience`:

```java
public interface CommandSender extends net.kyori.adventure.audience.Audience, Permissible {
```

`paper-api/src/main/java/org/bukkit/command/CommandSender.java`. `World` is an `Audience` too (`ForwardingAudience`), so `world.sendMessage(Component)` is valid without a player.

`sendMessage` on `CommandSender` is a **default that degrades to legacy**:

```java
@Override
default void sendMessage(final net.kyori.adventure.text.@NotNull Component message) {
    this.sendMessage(net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer.legacySection().serialize(message));
}
```

Implementations that support components (players, console) override it. So `sender.sendMessage(Component)` always *works*, but on a custom `CommandSender` you may silently lose hover/click/font.

Paper sugar on `CommandSender`:

```java
default void sendRichMessage(@NotNull String message);                                   // MiniMessage
default void sendRichMessage(@NotNull String message, TagResolver... resolvers);
default void sendPlainMessage(@NotNull String message);
net.kyori.adventure.text.@NotNull Component name();
```

`CommandSourceStack` mirrors this and additionally routes to the *executor* when it is a player (`sendReply`), plus `sendSuccess`/`sendFailure` with vanilla feedback semantics (`GameRules.SEND_COMMAND_FEEDBACK`, `LOG_ADMIN_COMMANDS`). For a command layer, `sendSuccess`/`sendFailure` are the correct primitives; `sendMessage` bypasses command feedback gating.

---

## G. GraalJS host reality

### G.1 Engine vs Context, and thread affinity

`Context` javadoc §Thread-Safety, verbatim:

> "It is safe to use a context instance from a single thread. It is also safe to use it with multiple threads if they do not access the context at the same time. Whether a single context instance may be used from multiple threads at the same time depends on if all initialized languages support it. If initialized languages support multi-threading, then the context instance may be used from multiple threads at the same time. If a context is used from multiple threads and the language does not fit, then an `IllegalStateException` is thrown by the accessing method."

> "Meta-data from the context's underlying engine can be retrieved safely by any thread at any time."

> "A context may be closed from any thread, but only if the context is not currently executing code. If the context is currently executing some code, a different thread may kill the running execution and close the context using `close(boolean)`."

For JS specifically (GraalJS docs §Multithreading, verbatim):

> 1. "An arbitrary number of JavaScript `Context`s can be created, but they should be used by one thread at a time."
> 2. "Concurrent access to JavaScript objects is not allowed: any JavaScript object cannot be accessed by more than one thread at a time."
> 3. "A `Context` can be accessed from multiple threads when proper synchronization is used."
> 4. "GraalJS does not allow the creation of threads from JavaScript with access to the current `Context`."

Engine sharing (embed-languages §Code Caching):

> "An explicit engine needs to be specified to enable code caching between multiple contexts… Code is only shared between contexts associated with one engine instance."

> "As opposed to contexts, engines can always be shared across multiple threads. Whether contexts can be shared across multiple threads depends on the language used."

> "we recommend using a singleton `Engine` instance if a global code cache is needed"

So: **one Engine, N Contexts, one owner thread each** is exactly the supported shape. `allowCreateThread` is orthogonal and defaults to off:

```java
public Builder allowCreateThread(boolean enabled) {
    this.allowCreateThread = enabled;   // "Default is false… Threads created by guest languages
    return this;                        //  are closed, when the context is closed."
}
```

`Context.java` (read with line numbers; `allowCreateThread` is at ~L1349–1361, `allowAllAccess` at ~L1363–1400, `allowHostClassLookup` at ~L1420–1497, `allowExperimentalOptions` at ~L1499–1513).

Note `allowAllAccess(true)` silently grants thread creation, host access, class loading, IO, experimental options, process creation and env access — enumerated verbatim in the `allowAllAccess` javadoc. That is why "never use `allowAllAccess`" is defensible.

### G.2 `HostAccess` — what it can and cannot express

Constants: `EXPLICIT` (default), `SCOPED`, `NONE`, `ALL`, `CONSTRAINED`, `ISOLATED`, `UNTRUSTED`.

`EXPLICIT` is defined verbatim as:

```java
HostAccess.EXPLICIT = newBuilder()
    .allowAccessAnnotatedBy(HostAccess.Export.class)
    .allowImplementationsAnnotatedBy(HostAccess.Implementable.class)
    .allowImplementationsAnnotatedBy(FunctionalInterface.class)
    .build();
```

`Builder` methods that actually exist (`HostAccess.java`):

```java
public Builder allowAccessAnnotatedBy(Class<? extends Annotation> annotation);
public Builder allowPublicAccess(boolean allow);
public Builder allowPublicAccess(Predicate<Member> predicate);        // @since 25.4
public Builder allowAccess(Executable element);
public Builder allowAccess(Field element);
public Builder denyAccess(Class<?> clazz);                            // + denyAccess(Class, boolean includeSubclasses)
public Builder allowAllImplementations(boolean allow);
public Builder allowAllClassImplementations(boolean allow);
public Builder allowImplementationsAnnotatedBy(Class<? extends Annotation> annotation);
public Builder allowImplementations(Class<?> type);
public Builder allowArrayAccess(boolean) / allowListAccess / allowIterableAccess / allowIteratorAccess / allowMapAccess / allowBufferAccess;
public Builder allowBigIntegerNumberAccess(boolean);
public Builder allowAccessInheritance(boolean);
public Builder methodScoping(boolean) / disableMethodScopingAnnotatedBy(...) / disableMethodScoping(...);
```

**`allowType` does not exist. `allowStaticAccess` does not exist. There is no package-level or class-list allow-list in `HostAccess` at all.** `HostAccess` is *member*-scoped (methods/fields/constructors), keyed by annotation, explicit `Member`, or a `Predicate<Member>` over public members. `denyAccess(Class, boolean)` is the only class-granular knob, and it is a *deny* list.

Class-level filtering lives on `Context.Builder`:

```java
public Builder allowHostClassLookup(Predicate<String> classFilter)   // by fully-qualified class name
```

javadoc: *"Sets a filter that specifies the Java host classes that can be looked up by the guest application. If set to `null` then no class lookup is allowed and relevant language builtins are not available (e.g. `Java.type` in JavaScript)… only classes are accessible that are exported to the unnamed module of the captured class loader."*

So an "allow-list of Paper API packages" requires **two** mechanisms: `allowHostClassLookup(name -> name.startsWith("org.bukkit.") || …)` **and** a `HostAccess` policy that lets members through. And `HostAccess` cannot help at all on Paper's own classes because they carry no `@HostAccess.Export`. The workable options are:

* `HostAccess.newBuilder(HostAccess.EXPLICIT).allowPublicAccess(true)` — exposes all public members of anything reachable; broad.
* `HostAccess.newBuilder().allowPublicAccess(member -> allowlistedPackages.contains(member.getDeclaringClass().getPackageName()))` — the only per-package mechanism, `@since 25.4`.
* Wrap every exposed value in a `ProxyObject` and never hand out host objects at all — the only approach that survives "no `allowAllAccess`".

Annotation-based allow-list exists (`@HostAccess.Export`, `@HostAccess.Implementable`, `@HostAccess.DisableMethodScoping`) but is not usable against Paper's API without a fork. Marking a *facade* class you own with `@Export` is the supported path.

### G.3 `setTimeout`, Promises, microtasks

* **No `setTimeout`/`setInterval`/event loop in a `Context`.** They are Node.js globals; the `Context` API "does not support CommonJS modules, and has no built-in `require()`" (GraalJS docs §JavaScript Modules). `console` exists (`js.console`, default true) and `print` exists; a timer host object must be supplied by the embedder.
* `Promise` exists (`Promise` is in the ECMAScript core library list) and interops with Java:
  * JS → Java: `jsPromise.invokeMember("then", javaThen)`.
  * Java → JS: expose a Java object implementing `PromiseExecutor` (`void onPromiseCreation(Value onResolve, Value onReject)`) as the `Promise` executor, or expose a thenable with `void then(Value onResolve, Value onReject)` and `await` it from JS.
  * `Graal.setUnhandledPromiseRejectionHandler(handler)` with `js.unhandled-rejections=handler`.
* **Draining:** there is **no documented host API** to pump the microtask queue, and no documented "call this to settle promises" pattern. The docs only show that host calls *can* resolve promises and that `await` on a Java thenable resumes the JS continuation. Anything stronger (e.g. "eval once, then loop until the queue is empty", `Context.enter()`/`leave()` bracketing, `Value.invokeMember("then", …)`) is **UNVERIFIED** — no primary source states when the job queue is flushed relative to `eval` returning.
* `js.commonjs-require`: *"By default, a Java `Context` does not load modules using the CommonJS `require()` function… Experimental support for CommonJS modules can be enabled through the `js.commonjs-require` option"*, plus `js.commonjs-require-cwd` and `js.commonjs-core-modules-replacements`. Marked *"Currently, this is an experimental feature and not for production usage."* It is the only way to get `require()`; it does **not** give you Node built-ins.
* `js.script-engine` / JSR-223: `ScriptEngine` *"internally wraps a polyglot `Context` instance"*. Nashorn compat is applied to ScriptEngine automatically: *"the `nashorn-compat` mode enables the relevant options when executing code on the `ScriptEngine` (but not on `Context`)"*.

### G.4 Context creation/close cost, caching, pooling

Documented statements only:

> "when a context is no longer needed, it is recommended to explicitly close it to ensure timely release of resources. While contexts are automatically closed when no longer strongly reachable, explicit closure is still preferred."

> "A context cannot free all native resources allocated automatically. For this reason it is necessary to close contexts after use."

> "Please note, canceling a single context can negatively affect the performance of other executing contexts constructed with the same engine."

`Context` javadoc. On caching: *"By default, code is cached within a single context instance only"*, and *"The data for the code cache is stored as part of the `Engine` instance. There is never any code sharing happening between two separate engine instances."*

**No official statement about pooling `Context`s, or about the memory cost of create/close churn, exists.** The "50× leak spike" style measurement is not answerable from docs; it must be measured. `Engine.supportsCompilation()` and `engine.CacheStoreEnabled`/`engine.CacheLoad` (native-image only, *"experimental"*) are the only cache knobs documented.

### G.5 `--experimental-options`, `js.nashorn-compat`, interpreter-only detection

* `allowExperimentalOptions(boolean)` gates experimental options; passing one without it *"results in an `IllegalArgumentException` when the context is built."*
* Options that **require** it and are in scope: `js.nashorn-compat` (also flips ECMAScript version to 5 by default — *"Might conflict with newer ECMAScript versions"*), `js.scripting`, `js.commonjs-require`, `js.crypto`.
* Nothing in the Paper-facing surface needs these. `js.nashorn-compat` is only worth enabling if you want `JavaImporter`, `Java.isJavaFunction/isScriptObject/isScriptFunction`, `new JFunction({apply: ...})` on interfaces, or package globals (`java`, `javax`, `com`, `org`, …).
* Interpreter-only on a stock JDK: yes, forced, for `Context` embeddings. Table (embed-languages §Runtime Optimization Support): Oracle/Community GraalVM 25 → optimizing runtime, no config; **Oracle JDK 25 / OpenJDK 25 → "Polyglot isolate only"**, fallback otherwise; JDK 21 → same. *"Fallback runtime: The guest application code is executed in interpreter-only mode, without runtime compilation to machine code."*
* Detection, three ways:
  1. `Engine.supportsCompilation()` — `@since 25.1`, *"Returns whether the current runtime supports optimizing guest language execution… Embedders can use this method to decide whether to enable isolate execution, for example with `Context.newBuilder().spawnIsolate(!Engine.supportsCompilation())`."*
  2. `Engine.getImplementationName()` — *"for example, 'Default Truffle Engine' or 'Graal Truffle Engine'"*; *"The returned value may change without notice."*
  3. The engine warning, verbatim: `[engine] WARNING: The polyglot engine uses a fallback runtime that does not support runtime compilation to native code.` Suppressible with `--engine.WarnInterpreterOnly=false` or `-Dpolyglot.engine.WarnInterpreterOnly=false`.
* Forcing fallback for testing: `-Dtruffle.UseFallbackRuntime=true`, or exclude `org.graalvm.truffle:truffle-runtime`.

---

## H. Prior art (facts only)

### Grakkit — `grakkit/grakkit`

* Host: Java plugin (+ Minestom extension), **GraalJS**, "designed to run on standard JDK, which means it comes pre-packaged with the GraalJS engine".
* Documented collision: *"This pre-packaged engine WILL conflict with the GraalVM JVM, so please use standard JDK to run servers running Grakkit!"* — i.e. they ship their own Graal and tell users not to run on a GraalVM JDK.
* Loads JS from `plugins/grakkit/index.js` (default), `require('@grakkit/stdlib-paper')` for the API, `/js` command for live eval and `core.reload()`.
* TypeScript: not directly — npm packages (`@grakkit/stdlib-paper`, `graal-types`) supply typings; the runtime only ever sees JS.
* Status: not archived; `pushed_at` 2025-01-05, 12 open issues, 230 stars. Repo metadata only — no statement of abandonment or of a Graal version (UNVERIFIED).

### EcmaCraft — `twlite/ecmacraft`

* Host: Spigot/Paper Java plugin "powered by GraalVM JavaScript", shaded jar, Java 21.
* Creates "a GraalVM JS context and loads `plugins/ecmacraft/main.js`"; the module's default export receives a `PluginContext`; decorators (`@Event`, `@Command`) map methods to Spigot events/commands.
* TypeScript: **not** at runtime — `esbuild` bundles TS to `main.js` before deployment (`pnpm` workspace + dev-plugin bundle).
* npm `ecmacraft` 0.0.2, published 2026-02-15, updated 2026-03-01, **1 weekly download**. Effectively unused; no documented dead-end beyond "early".

### PaperScript — `DARKPIX/PaperScript` (Hangar)

* Two engines by MC version: **GraalJS** for Paper 1.18–1.21 (Java 17/21) and **Nashorn** for 1.12.2/1.16.5. A host plugin loads scripts from a folder and exposes a fixed `ps` API (`ps.commands.register`, `ps.events.onPlayerJoin`, storage, scheduler).
* TypeScript: precompiled; typed SDK `@paperscript/sdk`, `npx paperscript init`.
* Documented limits, verbatim: *"Sandboxed scripts: no Java.type, no host IO, main-thread only"* and *"Hot reload via `/ps reload` — no server restart"*.
* Published 2026-07-11, version 0.2.0, 1 download. The "no `Java.type`" restriction is the notable data point: the only shipping GraalJS Paper host that chose safety over host access solved it by removing host interop entirely rather than by an allow-list.

### PaperTS — `MetlHedd/PaperTS`

* Host: **Javet (V8 + Node.js)**, *not* GraalJS. "Node.JS runtime is downloaded at runtime" from Javet's official dependencies.
* Loads TS/JS modules from `plugins/PaperTS/<module>/package.json` (`main` field), each in a Node runtime; `PaperTS.registerEvent` / `registerCommand` globals; `/paperts reload|load|unload|list`.
* Direct TS: no — requires a build step (`bun build … --target=node --format=cjs --external=org.*`); `package.json` `runType` selects `SynchronousOnNextTick` / `AsynchronousOnNextTick` / `NewThread`.
* Documented limitation (issue #1, open): *"Currently, we can only generate javascript files from typescript using 'commonjs' type. We currently lack using modularization from javet… to handle dynamic loading."*
* Status: 16 stars, 1 fork, 4 open issues, last push 2026-01-16, Hangar 1.2.0 (2025-07-25).

### Cross-cutting fact

Every one of the four either (a) ships its own engine and warns about GraalVM JDK conflicts (Grakkit), (b) shades the engine (EcmaCraft), (c) removes `Java.type` to stay safe (PaperScript), or (d) abandons Graal for Javet/V8 (PaperTS). None of them demonstrates a working `HostAccess` package allow-list over the Paper API.

---

## I. Contradictions against the current design docs

Files read: `apps/docs/design/architecture.md`, `threading.md`, `events.md`, `commands.md`, `ui.md`, `apps/docs/patterns/pdc.md`.

### architecture.md

| Line / claim | Verdict | What the source says |
|---|---|---|
| "embeds `js-community`, one Context per plugin on a shared Engine" | **CONFIRMED** | Artifact `org.graalvm.polyglot:js-community`; engine sharing is the documented code-cache mechanism; contexts are one-thread-at-a-time |
| "Graal loads through the `paper-plugin.yml` `PluginLoader`" | **PARTIALLY CONTRADICTED** | `loader:` exists and `PluginLoader` is real, but its only method is `classloader(PluginClasspathBuilder)`. It cannot control plugin class loading, and it runs in a *different* classloader where "any static values set in this class/any other classes loaded [do] not persist" |
| "**Don't shade or relocate Graal.**" | **CONFIRMED as guidance** (not a Paper rule) | GraalVM: *"We discourage bundling all dependencies into a single 'fat' JAR"*; Grakkit's "pre-packaged engine WILL conflict with the GraalVM JVM" is the concrete failure mode |
| "`HostAccess` is an **allow-list** of Paper API packages. Never use `allowAll`" | **CONTRADICTED** | `HostAccess` has no package/class allow-list, no `allowType`, no `allowStaticAccess`. Class filtering is `Context.Builder.allowHostClassLookup(Predicate<String>)`. Per-package member filtering only exists as `allowPublicAccess(Predicate<Member>)` (`@since 25.4`). Paper classes are not `@HostAccess.Export`-annotated, so `EXPLICIT` yields nothing |
| "The **shape** of the command tree is fixed at load time, because the Paper Lifecycle API requires it" | **CONTRADICTED** | `COMMANDS` is `ReloadableRegistrarEvent<Commands>` with `Cause.INITIAL/RELOAD`; docs: registration is re-run "each time it is required"; `PaperCommands.setDispatcher` builds a **new** `CommandDispatcher`; `CommandNode.addChild` mutates live nodes and overwrites `command` |
| "Handlers can still be hot-swapped through a lookup table" | **CONFIRMED, but for the stated reason only** | Paper copies the node (`PaperBrigadier.copyLiteral`) for the namespaced variant, so mutating your builder post-`register` is inert. Hot-swap works because `copyLiteral` copies the *function reference* of `executes(...)`, so a captured table is live |
| "If the shape changes, the host warns that a full `/reload` is needed" | **UNVERIFIED / unnecessary** | Re-registration on `Cause.RELOAD` is supported; a shape change needs a **re-run of the COMMANDS handler**, not a full server reload |
| "Unregister everything in the Java Registry: listeners, tasks, permissions, open GUIs" | **PARTIALLY CONTRADICTED** | Listeners: `HandlerList.unregisterAll(Plugin)` — fine. Tasks: `cancelTasks` — fine. Permissions: `PluginManager.removePermission` — fine. **Commands: no unregister API** (`Registrar` is an empty marker). Either re-register on reload or reach into the dispatcher |
| "`context.close()`" then "Create a new Context" | **CONFIRMED as legal** | `close()` throws `IllegalStateException` only if the context is currently executing on another thread; `close(true)` cancels instead |

### threading.md

| Claim | Verdict | Source |
|---|---|---|
| "Commands execute with `Main`, because Paper runs them on the server or region thread" | **UNVERIFIED** | No Paper source or doc states it. `CommandSourceStack.getSender()` may be a *no-op* sender when "the server either doesn't exist yet"; bootstrap-registered commands exist for datapack parsing; on Folia the thread is the owning region, not "main" |
| "Suggestions and async events get `AsyncThread`. They have a time budget" | **CONTRADICTED for suggestions** | `SuggestionProvider.getSuggestions` is invoked synchronously on the caller's thread; Paper's own docs label `supplyAsync` as the branch where "most Paper API is not usable". Nothing offloads suggestion providers |
| "Async Bukkit handlers get `AsyncThread` instead" | **CONTRADICTED for `AsyncChatEvent`** | `AsyncChatEvent` "will sometimes fire synchronously… If a plugin triggers this event by compelling a player to chat, this event will be synchronous" |
| "Graal still runs JS serially / one owner thread per plugin" | **CONFIRMED** | GraalJS rules 1–2; `Context` javadoc §Thread-Safety |
| "`yield* Main` doesn't move you…" + `Paper.on` picking a region from `Entity`/`Location` | **CONFIRMED as an API shape** | `Entity#getScheduler()` vs `RegionScheduler` location overloads; `RegionScheduler` javadoc explicitly forbids using it for entities |
| "The tick Scheduler pump often enters the Context while already on main" | **CONFIRMED as feasible** | `Context.enter()/leave()` can be bracketed around a tick; `enter()` may be called multiple times on the same thread |

### events.md

| Claim | Verdict | Source |
|---|---|---|
| "The host pushes each Bukkit dispatch into the stream with `runSyncExit` **before the Java listener returns**" | **CONFIRMED as achievable** | `EventExecutor#execute` runs on the dispatching thread inside `PaperEventManager.callEvent`; a synchronous `runSyncExit` completes before the executor returns |
| "`SyncWindow` is present only during that unbuffered sync push… a sleep, offload or fork ends it" | **CONFIRMED as a design consequence** | `setCancelled` is read *after* dispatch (`Event.callEvent`), so cancellation only lands if it happens before return |
| "This matches MCCoroutine: the first real suspend ends the window" | **UNVERIFIED** | No primary source for MCCoroutine semantics was checked |
| "there is **one Java listener per event type**" | **CONFIRMED as a choice, CONTRADICTED as a constraint** | `HandlerList.register` allows any number of `RegisteredListener`s per event class (it only rejects an identical listener at the same priority). The *actual* constraint is that `priority` and `ignoreCancelled` are per-`RegisteredListener` (`RegisteredListener` fields): one Java listener ⇒ one priority per event type for the whole host, shared by every plugin |
| "Keyed `.events` fan out from it" | **CONFIRMED as achievable** | no platform obstacle; `HandlerList` is per event class |
| "Java and TS listeners on the same event still respect `priority` and `ignoreCancelled` order" | **CONFIRMED** | `PaperEventManager.callEvent` iterates one baked array ordered by `EventPriority` slot across all plugins; `ignoreCancelled` is checked per registration at dispatch time |
| "Async Bukkit events… running on the async thread with a timeout and no hop to main" | **PARTIALLY CONTRADICTED** | `AsyncChatEvent` may be sync; `AsyncPlayerPreLoginEvent` is always async. Also: an async event **cannot** legally be re-fired from the primary thread (`PaperEventManager` throws) |
| implicit: you may register listeners after first dispatch and have them take effect mid-dispatch | **CONTRADICTED** | "Any newly registered or unregistered handler is ignored after an event starts execution" (`Event` javadoc) |

### commands.md

| Claim | Verdict | Source |
|---|---|---|
| "maps arguments to Brigadier `ArgumentTypes`" | **CONFIRMED** | `ArgumentTypes` static factories |
| "separates sender from executor (`CommandSourceStack`)" | **CONFIRMED** | `getSender()` vs `getExecutor()`, plus `withExecutor`/`withLocation` |
| "checks permissions in Brigadier `requires` and again at runtime" | **CONFIRMED** | `ArgumentBuilder.requires(Predicate<S>)` / `CommandNode.canUse` |
| "Call `updateCommands` when permissions change" | **CONFIRMED, with the exact call** | `Player#updateCommands()`; "completely thread safe" |
| "Suggestions may run off-main… no world access" | **CONTRADICTED** | see above; synchronous by default |
| "Use Paper `ArgumentTypes` (`player`, `blockPosition`, selectors) and resolve them against the command source" | **CONFIRMED** | `ArgumentTypes.player()` → `PlayerSelectorArgumentResolver`, `resolver.resolve(context.getSource())` |
| "Tree shape registered at load; handler table hot-swappable on reload" | **CONTRADICTED (the "at load" part)** | re-registration happens on `Cause.RELOAD`, not only at enable |
| implicit: `register` returns something you can hold to unregister | **CONTRADICTED** | returns `Set<String>` of labels; `Commands` has no `unregister` |

### ui.md

| Claim | Verdict | Source |
|---|---|---|
| "Click handlers run synchronously, like event handlers inside `SyncWindow`: cancel before returning" | **CONFIRMED in effect, CONTRADICTED in mechanism** | `InventoryClickEvent` is an ordinary sync `Cancellable`; cancelling works because the server reads `isCancelled()` after dispatch. There is no `SyncWindow` concept, and no `Main`/capability is implied by the platform |
| "Deny all clicks by default" | **CONFIRMED as a pattern** | requires explicit `setCancelled(true)` on `InventoryClickEvent` *and* `InventoryDragEvent`; nothing denies by default |
| "Open and close on the next tick" | **UNVERIFIED** | not a Paper requirement; no doc requires next-tick scheduling for `openInventory` |
| "A custom `InventoryHolder`" / "One Model per viewer" | **CONFIRMED as supported** | `InventoryHolder` is the documented way to identify your inventory in `InventoryClickEvent#getInventory().getHolder()` |

### pdc.md

| Claim | Verdict | Source |
|---|---|---|
| "`Pdc.get` returns `Option<A>`. A tag that fails to decode surfaces as `PdcDecodeError`" | **CONFIRMED as a mapping, with a caveat** | underlying `get` returns `@Nullable C`; a type mismatch throws `IllegalArgumentException` (not a null and not a checked exception) |
| "Struct schemas such as `Home` are stored as a nested `TAG_CONTAINER`" | **CONFIRMED** | `PersistentDataType.TAG_CONTAINER`; `getAdapterContext().newPersistentDataContainer()`; docs: "Tag Containers — a way to nest PDCs within each other" |
| "`Pdc.set` / `Pdc.get` require `Main`, so wrap them in `Paper.on(holder, …)`" | **CONTRADICTED as a platform rule** | No thread restriction is documented anywhere, and `CraftPersistentDataContainer` has no thread check — it is an unsynchronized `HashMap`. The restriction is real only for *region-owned holders* (entity/world/tile-state), and is **over-strict** for `ItemStack`/`ItemMeta`, which have no owning thread |
| "get and set values as Effects on any `PersistentDataHolder`" | **CONTRADICTED for `ItemStack`** | `ItemStack` implements `PersistentDataViewHolder`, not `PersistentDataHolder`; its container is read-only and must be mutated via `editPersistentDataContainer` |
| "on the holder's thread" (implicit: holders are uniform) | **CONTRADICTED** | `Location` and `Block` are not holders at all; `Block` only via `getState()` when it is a `TileState` |

---

## What this breaks in the current docs

1. **`architecture.md` "HostAccess is an allow-list of Paper API packages"** — not implementable as written. `HostAccess` has no package or class allow-list, and Paper's API is not `@HostAccess.Export`-annotated. The sentence must split into two mechanisms: `allowHostClassLookup(Predicate<String>)` for class names, and `allowPublicAccess(Predicate<Member>)` (GraalVM ≥ 25.4) or `@Export`-annotated facades for members. Pick one and say which.
2. **`architecture.md` "shape fixed at load time, because the Paper Lifecycle API requires it"** — the Lifecycle API is the *reason the shape can change*: `COMMANDS` is a `ReloadableRegistrarEvent` with `Cause.RELOAD`, the dispatcher is rebuilt, and the docs say registration is re-run whenever required. Replace with: "re-registration is supported; a shape change requires re-running the COMMANDS handler, which the host does on reload."
3. **`architecture.md` reload step 2 "Unregister everything… commands"** — there is no command unregister API. `Commands extends Registrar` and `Registrar` is an empty marker. State the real mechanism (re-register / dispatcher surgery).
4. **`threading.md` "Suggestions … get `AsyncThread`"** — false. `SuggestionProvider` is called synchronously on the dispatch thread. Either remove the claim or say the host explicitly *chooses* to hand suggestions to a worker via `CompletableFuture.supplyAsync`, accepting that "most Paper API is not usable" there (Paper's own words).
5. **`threading.md` + `events.md` "Async Bukkit events … run on the async thread"** — `AsyncChatEvent` is sometimes synchronous. Any `AsyncThread` capability keyed on "this event class is async" is unsound; it must be keyed on `event.isAsynchronous()` per instance.
6. **`pdc.md` "`Pdc.set` / `Pdc.get` require `Main`"** — overstated and, for items, wrong. No documented thread restriction exists on PDC; the restriction is per-holder (region-owned vs detached). Either scope the capability to region-owned holders, or keep it as an explicit safety choice and stop calling it a Paper rule.
7. **`pdc.md`/`items` API accepting `PersistentDataHolder`** — `ItemStack` is not one. The item path must be a distinct entry point (`editPersistentDataContainer`, or `getItemMeta` → mutate → `setItemMeta`), and the doc's `Items.editPdc` example must be documented as "the handle is not valid outside the consumer."
8. **`events.md` "one Java listener per event type"** — true as a design, but the doc omits the consequence that makes it a problem: `priority` and `ignoreCancelled` are per-`RegisteredListener`, so one Java listener per event type forces **one priority for the entire host** on that event type, shared by every plugin. Either register per (event type × priority) or stop promising per-plugin priorities.
9. **`commands.md` "Tree shape registered at load"** — same correction as (2), plus: `Commands.register` returns `Set<String>` (labels), not a node handle, so nothing in the doc may imply a holdable registration token.
10. **`architecture.md` "Graal loads through the `PluginLoader`"** — `PluginLoader` cannot control plugin class loading and its statics are discarded ("called from a different classloader"). Reword to "the `PluginLoader` injects the Graal jars onto the plugin classpath."
11. **Missing entirely:** the `paper-api` 26.3 / Java 25 baseline, `api-version` ≥ 1.19 for Paper plugins, and the fact that `libraries:` is a `plugin.yml`-only field. Any doc that offers `libraries:` inside `paper-plugin.yml` is wrong.
12. **`ui.md`** — no claim is badly wrong, but "cancel before returning" should cite `Cancellable`/post-dispatch read rather than a `SyncWindow`, which does not exist at the platform level.
