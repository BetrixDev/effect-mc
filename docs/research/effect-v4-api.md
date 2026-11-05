# Effect v4 API — primary-source verification

**Access date:** 2026-11-03
**Versions checked:**
- npm `effect@4.1.2` (installed and executed locally; `latest` dist-tag, published `2026-11-02T04:27:38.068Z`)
- GitHub `Effect-TS/effect` branch **`main`** @ `1048919d` (`packages/effect/package.json` → `"version": "4.1.2"`; `main` **is** the v4 line, there is no `v4` branch)
- TypeScript 7.0.2, `--strict` against the published `effect@4.1.2` typings
- Registry: `https://registry.npmjs.org/effect`
- Docs: `https://effect.website/docs/v4` (site root still redirects to `/docs/v3`; v4 has its own switcher entry)
- Alchemy: `sam-goodwin/alchemy` `main`, package version `0.94.0`

Verification method: every runtime claim below was executed against `effect@4.1.2` in a scratch install (outside this repo). Every type claim was compiled with `tsc --strict` against the published `.d.ts`. Claims that are design intent in this repo (not Effect API) are marked UNVERIFIED/NOT-EFFECT.

---

## Fact sheet

| # | Claim | Verdict | Source |
|---|-------|---------|--------|
| A1 | v4 is unpublished / beta-only | **CONTRADICTED** | `latest` = `4.1.2`; `4.0.0` GA'd `2026-10-01` (npm registry) |
| A2 | v4 lives only in source | **CONTRADICTED** | `packages/effect/package.json` v4.1.2 on `main` = published |
| A3 | Newest 3.x is the current release | **CONTRADICTED** | `prev` = `3.22.4` (2026-10-22); `latest` is v4 |
| B1 | `Context.Service` exists | **CONFIRMED** | `Context.ts:209` |
| B2 | `Context.Service<Self>()(id, { make })` generates `.make` | **CONFIRMED** | `Context.ts:233-251`; runtime `.make` is an `Effect` |
| B3 | It also generates `.layer` | **CONTRADICTED** | no `layer` key in `ServiceClass` (`Context.ts:129-134`); runtime `"layer" in WarpService === false` |
| B4 | `Context.Tag` still exists | **CONTRADICTED** | zero occurrences of `Tag` in `Context.ts`; runtime `Context.Tag === undefined` |
| B5 | Class form needs `{}` empty extends | **CONFIRMED** | `ServiceClass.new(_: never)` (`Context.ts:132`); official example `Context.ts:190-192` |
| C1 | `Schema.TaggedError<T>()(tag, fields)` | **CONFIRMED** | `Schema.ts:17905-17922` |
| C2 | Third arg is `annotations` (not `message`/`cause`) | **CONFIRMED** | `Schema.ts:17910` |
| C3 | `message`/`cause` are a second constructor arg | **CONTRADICTED** | `internal/core.ts:694` reads them from the **args object**; schema strips undeclared keys |
| C4 | Instance has `_tag` / `message` / `cause` | **CONFIRMED with caveat** | `_tag` set; `message` defaults `""`; a schema field named `name` overwrites `Error.name` |
| D1 | `Effect.provideService(e, Main, v)` narrows `R` | **CONFIRMED** | `Effect.ts:6592-6608` → `Effect<A,E,Exclude<R,I>>` |
| D2 | `yield* Tag` works | **CONFIRMED** | `Context.ts:68` `Key extends Effect<Shape, never, Identifier>` |
| D3 | `Effect.provideLayer` / `withScheduler` / `locally` exist | **CONTRADICTED** | all three absent from `Effect.ts` |
| E1 | `Scheduler` has `scheduleTask`/`getCurrentTime` | **CONTRADICTED** | `Scheduler.ts:34-38`: only `executionMode`, `shouldYield`, `makeDispatcher` |
| E2 | `Scheduler.make` / `Scheduler.layer` exist | **CONTRADICTED** | `Scheduler.ts` exports only `Scheduler`, `MixedScheduler`, `MaxOpsBeforeYield`, `PreventSchedulerYield` |
| E3 | A custom Scheduler can drive the tick | **CONTRADICTED for `runSyncExit`** | `internal/effect.ts:5886` hardcodes `new Scheduler.MixedScheduler("sync")` |
| E4 | `Clock.make` exists | **CONTRADICTED** | `Clock.ts` exports `Clock`, `clockWith`, `currentTimeMillis`, `currentTimeNanos`, `monotonicTimeNanos` |
| E5 | `Effect.sleep` is driven by the `Clock` service | **CONFIRMED** | runtime: provided `Clock.sleep` called with 50 ms |
| E6 | `runSyncExit` on a suspending effect fails | **CONFIRMED** | `Exit.Die(AsyncFiberError)`; `internal/effect.ts:5889,6533` |
| E7 | "a fork ends the sync window" | **CONTRADICTED** | `Effect.forkChild(Effect.void)` under `runSyncExit` → `Success` |
| F1 | `ManagedRuntime.toLayer` exists | **CONTRADICTED** | absent from `ManagedRuntime.ts`; runtime `undefined` |
| F2 | Runtime can be rebuilt after dispose | **CONFIRMED (new instance)** | disposed instance dies permanently (`ManagedRuntime.ts:418`); 3-iteration loop verified |
| F3 | `Stream.runForEach` returns `Effect<void,E,R>` | **CONFIRMED** | `Stream.ts:11378-11385` |
| F4 | `Effect.fork` exists | **CONTRADICTED** | replaced by `forkChild`/`forkIn`/`forkScoped`/`forkDetach` |
| F5 | `Effect.yieldNow()` is a function | **CONTRADICTED** | `Effect.ts:1808` — it is a **value** `Effect<void>` |
| G1 | effect/cli renamed `Argument`/`Flag` → `Args`/`Options` | **CONTRADICTED** | `src/cli/` has `Argument.ts`, `Flag.ts`; no `Args.ts`/`Options.ts` |
| G2 | `Command.make(name, config, handler)` | **CONFIRMED** | `cli/Command.ts:644-656` |
| G3 | Handler may require a service in `R` | **CONFIRMED** | `cli/Command.ts:652-656` |
| H1 | Alchemy exports `Plugin(...)` | **CONTRADICTED** | no such export; only esbuild/Vite "plugin" files |
| H2 | Alchemy exports `Test.make` | **CONTRADICTED** | `alchemy.test(...)` in `alchemy/src/test/vitest.ts` |
| H3 | Alchemy's `X.layer()` satisfies an `R` requirement | **CONTRADICTED** | Alchemy has **no** `effect` dependency at all |
| I | `class X extends Context.Tag("X")<X,...>() {}` compiles | **CONTRADICTED** | `Context.Tag` removed |

---

## A. Version reality

`effect@4.1.2` is the current **stable, GA** release. v4 is not beta-only and does not live only in source.

npm dist-tags (`https://registry.npmjs.org/effect`, 2026-11-03):

```
latest    4.1.2
staging   4.1.2
rc        4.0.0-rc.118
beta      4.0.0-beta.107
prev      3.22.4
snapshot  0.0.0-snapshot-6ebc752baf28354006ca2a0ae783a5bccf5de9ad
```

Publish timestamps:

| Version | Published (UTC) |
|---|---|
| `4.0.0` (first GA) | `2026-10-01T03:11:28.537Z` |
| `4.1.2` | `2026-11-02T04:27:38.068Z` |
| `3.22.4` (last v3) | `2026-10-22T20:49:57.301Z` |

- **Which branch carries v4:** `main`. `packages/effect/package.json` on `main` reads `"version": "4.1.2"`. There is **no** `v4` branch (HTTP 404); a `v3` maintenance branch does exist (sha `a67af3d0`), which is why `3.22.4` shipped after `4.0.0`.
- **Newest published 3.x:** `3.22.4`, reachable via the `prev` tag (`npm i effect@prev` or `effect@3`). The v4 API is **published**, not source-only. The framework can depend on v4 today.
- All v4 subpath modules ship from the same package (`effect/cli`, `effect/schema`, `effect/sql`, `effect/rpc`, …). `@effect/sql@0.52.1` still declares `"effect": "^3.22.1"` — the `@effect/*` satellite packages are the **v3** line. In v4, `SqlError` lives at `effect/sql/SqlError`.

---

## B. `Context` / `Service` shape

Source: `packages/effect/src/Context.ts` @ `main`.

### B1. `Context.Tag` is gone

`grep -c '\bTag\b' Context.ts` → **0**. Runtime: `Context.Tag === undefined`. Compile: `Property 'Tag' does not exist on type 'typeof import("effect/Context")'` (TS2339). `Context.Service` is the only key constructor.

### B2. `Context.Service` — real signatures

```ts
// Context.ts:209
export const Service: {
  // function-style: one generic = the shape (also becomes the identifier)
  <Identifier, Shape = Identifier>(
    key: string,
    options?: { readonly fiberCached?: boolean | undefined } | undefined
  ): Service<Identifier, Shape>

  // class-style, explicit Shape; `make` optional
  <Self, Shape>(): <
    const Identifier extends string,
    E,
    R = Types.unassigned,
    Args extends ReadonlyArray<any> = never
  >(
    id: Identifier,
    options?: {
      readonly make?: ((...args: Args) => Effect<Shape, E, R>) | Effect<Shape, E, R> | undefined
      /** @internal */
      readonly fiberCached?: boolean | undefined
    } | undefined
  ) =>
    & ServiceClass<Self, Identifier, Shape>
    & ([Types.unassigned] extends [R] ? unknown
      : { readonly make: [Args] extends [never] ? Effect<Shape, E, R> : (...args: Args) => Effect<Shape, E, R> })

  // class-style, Shape inferred FROM `make`; `options` REQUIRED
  <Self>(): <
    const Identifier extends string,
    Make extends Effect<any, any, any> | ((...args: any) => Effect<any, any, any>)
  >(
    id: Identifier,
    options: {
      readonly make: Make
      /** @internal */
      readonly fiberCached?: boolean | undefined
    }
  ) =>
    & ServiceClass<
      Self,
      Identifier,
      Make extends
        Effect<infer _A, infer _E, infer _R> | ((...args: infer _Args) => Effect<infer _A, infer _E, infer _R>) ? _A
        : never
    >
    & { readonly make: Make }
} = function() { ... }
```

`Service` / `ServiceClass`:

```ts
// Context.ts:103
export interface Service<inout Identifier, inout Shape> extends Key<Identifier, Shape> {
  of(this: void, self: Shape): Shape
  context(self: Shape): Context<Identifier>
  use<A, E, R>(f: (service: Shape) => Effect<A, E, R>): Effect<A, E, R | Identifier>
  useSync<A>(f: (service: Shape) => A): Effect<A, never, Identifier>
}

// Context.ts:129
export interface ServiceClass<inout Self, inout Identifier extends string, inout Shape>
  extends Service<Self, Shape>
{
  new(_: never): ServiceClass.Shape<Identifier, Shape>
  readonly key: Identifier
}
```

And the key **is** an Effect, which is why `yield* MyTag` works:

```ts
// Context.ts:68
export interface Key<out Identifier, out Shape> extends Effect<Shape, never, Identifier> { ... }
```

### B3. Does it accept `{ make: Effect }` and auto-generate `.make`? — **Yes, and only `.make`**

Runtime (verified on `4.1.2`):

```
WarpService.key:           "@homes/WarpService"
typeof .make:              "object"   (Effect.isEffect === true)
"layer" in WarpService:    false
typeof .of/.use/.context:  function function function
Context.isKey(WarpService): true
Layer.effect(WarpService, WarpService.make): Layer<WarpService, never, never>
```

`init` assigns the passed effect verbatim, so `.make` is the **Effect value**, not a thunk:

```ts
// Context.ts:256-268
const init = (key: string, options?: {
  readonly defaultValue?: any
  readonly make?: any
  readonly fiberCached?: boolean
}) => {
  self.key = key
  ...
  if (options?.make) {
    ;(self as any).make = options.make
  }
  ...
}
```

**There is no `.layer`.** `ServiceClass` declares only `key`, `of`, `context`, `use`, `useSync`, and the construct signature. The repo must keep writing `Layer.effect(WarpService, WarpService.make)` explicitly — which is correct v4:

```ts
// Layer.ts:1039
export const effect: {
  <I, S>(service: Context.Key<I, S>): <E, R>(
    effect: Effect<S, E, R>
  ) => Layer<I, E, Exclude<R, Scope.Scope>>
  <I, S, E, R>(
    service: Context.Key<I, S>,
    effect: Effect<Types.NoInfer<S>, E, R>
  ): Layer<I, E, Exclude<R, Scope.Scope>>
}
```

### B4. Overload gotcha: you cannot write `Context.Service<X>()("id")`

`Context.Service<Marker>()("Marker")` **fails to compile**: `Expected 2 arguments, but got 1` (TS2554). The only class-style form without `make` requires **both** generics. Correct marker declarations:

```ts
class Main       extends Context.Service<Main, { readonly region?: string }>()("Main") {}
class AsyncThread extends Context.Service<AsyncThread, void>()("AsyncThread") {}
```

`Context.Service<X>()("id", { make })` works because `make` lets the Shape be inferred (overload 3).

### B5. `{}` empty-extends — required

`ServiceClass` has a construct signature (`new(_: never)`), so the two-stage call returns a class expression that must be extended by a class declaration, which needs a body. The official example does exactly this:

```ts
// Context.ts:189-192
// Create a service class
class Config extends Context.Service<Config, {
  port: number
}>()("Config") {}
```

### B6. `Tag` vs `Service` (what replaced what)

| v3 | v4 |
|---|---|
| `Context.Tag("X")<Self, Shape>() {}` | `class X extends Context.Service<X, Shape>()("X") {}` |
| `Context.GenericTag<S>("X")` | `Context.Service<S>("X")` |
| `Context.Tag` with default | `Context.Reference<Shape>("X", { defaultValue })` (`Context.ts:1390`) |

`Context.Reference` is a `Service` subtype whose getters fall back to a lazily computed default, which is how `Scheduler.Scheduler` and `Clock.Clock` are defined.

---

## C. `Schema.TaggedError`

### C1. Real signature

```ts
// Schema.ts:17905
export const TaggedError: {
  <Self = never, Brand = {}>(identifier?: string): {
    <Tag extends string, const Fields extends Struct.Fields>(
      tag: Tag,
      fields: Fields,
      annotations?: Annotations.Declaration<Self, readonly [TaggedStruct<Tag, Fields>]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.TaggedError">
      : Class<Self, TaggedStruct<Tag, Fields>, Cause_.YieldableError & Brand>
    <Tag extends string, S extends Struct<Struct.Fields>>(
      tag: Tag,
      schema: S,
      annotations?: Annotations.Declaration<
        Self,
        readonly [Struct<Simplify<{ readonly _tag: tag<Tag> } & S["fields"]>>]
      >
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.TaggedError">
      : Class<Self, Struct<Simplify<{ readonly _tag: tag<Tag> } & S["fields"]>>, Cause_.YieldableError & Brand>
  }
}
```

So it is `Schema.TaggedError<Self>(identifier?)(tag, fields, annotations?)`. The repo's form is exactly right:

```ts
class WarpNotFound extends Schema.TaggedError<WarpNotFound>()("WarpNotFound", { name: Schema.String }) {}
```

The third argument is **annotations**, not `message`/`cause`:

```ts
// Schema.ts:17910
annotations?: Annotations.Declaration<Self, readonly [TaggedStruct<Tag, Fields>]>
```

Omitting `Self` produces the string type `"Missing \`Self\` generic - use \`class Self extends Schema.TaggedError<Self>(...)\`"` — a deliberate compile error (`Schema.ts:17469`).

`_tag` is injected into the struct automatically:

```ts
// Schema.ts:17929-17937
const struct = isStruct(schema) ?
  schema.mapFields((fields) => ({ _tag: tag(tagValue), ...fields }), {
    unsafePreserveChecks: true
  }) :
  TaggedStruct(tagValue, schema)
return Error<any, {}>(identifier ?? tagValue)(struct, annotations as ...)
```

### C2. Instance shape (measured, `4.1.2`)

```js
class WarpNotFound extends Schema.TaggedError()("WarpNotFound", { name: Schema.String }) {}
const e = new WarpNotFound({ name: "home" })
```
```
e instanceof Error      -> true
e._tag                  -> "WarpNotFound"
e.name                  -> "home"          // <-- schema field SHADOWS Error.name
e.constructor.name      -> "WarpNotFound"
e.message               -> ""              // Error message defaults to empty
e.cause                 -> undefined
Object.keys(e)          -> ["_tag", "name"]
e.toString()            -> "home"
JSON.stringify(e)       -> {"_tag":"WarpNotFound","name":"home"}
```

Construction is `new X(input, options?)` where `options` is `MakeOptions` = `{ parseOptions?, disableChecks? }` only (`Schema.ts:147-163`). **`message` and `cause` come from the input object**, not a second argument:

```ts
// internal/core.ts:692-703
return class Base extends YieldableError {
  constructor(args: Record<string, any> | undefined) {
    super(args?.message, args?.cause ? { cause: args.cause } : undefined)
    if (args) { InternalRecord.assignProperties(this, args); ... }
  }
```

Because the schema **strips undeclared keys**, `message`/`cause` only take effect if declared as struct fields:

```js
class WithMessage extends Schema.TaggedError()("WithMessage",
  { detail: Schema.String, message: Schema.String, cause: Schema.Unknown }) {}
new WithMessage({ detail: "d", message: "boom", cause: new Error("root") })
// message -> "boom", cause.message -> "root", name -> "WithMessage"  (not shadowed)
```

`YieldableError` is a real `Error` and is directly yieldable, so `yield* new WarpNotFound(...)` fails the fiber with it:

```ts
// Cause.ts:1186
export interface YieldableError extends Error, Pipeable, Inspectable {
  readonly [Effect.TypeId]: Effect.Variance<never, this, never>
  [Symbol.iterator](): Effect.EffectIterator<Effect.Effect<never, this, never>>
}
```

### C3. Matching

- `Effect.catchTag("WarpNotFound", e => ...)` — confirmed working (`Effect.ts:2859`); keys off `_tag`.
- `Schema.is(WarpNotFound)(value)` — confirmed `true` for instances, `false` for plain objects with `_tag`.
- `Effect.catchTags`, `Effect.catchTag` with an array of tags.

**Trap:** because `services.md` and `errors.md` put `name` in the error fields, `e.name` is **not** the tag. Log lines and `toString()` will read `home`, not `WarpNotFound`. `errors.md`'s `PdcDecodeError` (`key`, `detail`) is unaffected.

---

## D. Thread / capability provisioning

All from `packages/effect/src/Effect.ts` @ `main`.

```ts
// Effect.ts:6592
export const provideService: {
  <I, S>(service: Context.Key<I, S>): {
    (implementation: S): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, I>>
    <A, E, R>(self: Effect<A, E, R>, implementation: S): Effect<A, E, Exclude<R, I>>
  }
  <I, S>(service: Context.Key<I, S>, implementation: S): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, I>>
  <A, E, R, I, S>(self: Effect<A, E, R>, service: Context.Key<I, S>, implementation: S): Effect<A, E, Exclude<R, I>>
}

// Effect.ts:6666
export const provideServiceEffect: {
  <I, S, E2, R2>(service: Context.Key<I, S>, acquire: Effect<NoInfer<S>, E2, R2>):
    <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, Exclude<R, I> | R2>
  <A, E, R, I, S, E2, R2>(self: Effect<A, E, R>, service: Context.Key<I, S>, acquire: Effect<NoInfer<S>, E2, R2>):
    Effect<A, E | E2, Exclude<R, I> | R2>
}

// Effect.ts:6148 (replaces Effect.provideLayer)
export const provide: {
  <const Layers extends [Layer.Any, ...Array<Layer.Any>]>(layers: Layers, options?: { readonly local?: boolean }):
    <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | Layer.Error<Layers[number]>,
      Layer.Services<Layers[number]> | Exclude<R, Layer.Success<Layers[number]>>>
  <ROut, E2, RIn>(layer: Layer.Layer<ROut, E2, RIn>, options?: { readonly local?: boolean }):
    <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, RIn | Exclude<R, ROut>>
  <R2>(context: Context.Context<R2>): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, R2>>
  <A, E, R, const Layers extends [Layer.Any, ...Array<Layer.Any>]>(self: Effect<A, E, R>, layers: Layers, options?): ...
}

// Effect.ts:6326 / 6373 / 6050
export const service: <I, S>(service: Context.Key<I, S>) => Effect<S, never, I>
export const serviceOption: <I, S>(key: Context.Key<I, S>) => Effect<Option<S>>
export const context: <R = never>() => Effect<Context.Context<R>, never, R>
```

### D1. Does `provideService` change the requirement in the *type* without a Layer? — Yes

`Effect.provideService(effect, Main, value)` returns `Effect<A, E, Exclude<R, I>>`, where `I` is the **identifier** type (for a class-style service, the class itself). Compile-verified:

```ts
declare const needMain: Effect.Effect<void, never, Main>
const n1: Effect.Effect<void, never, never> = Effect.provideService(needMain, Main, {})
const n2: Effect.Effect<void, never, never> = Effect.provideService(needMain, Main)({})
const n3: Effect.Effect<void, never, never> = Effect.provideServiceEffect(needMain, Main, Effect.succeed({}))
```

All three compile; assigning to `Effect<void, never, Main>` would not. This is exactly the primitive `Paper.on(player, effectRequiringMain)` needs — it needs **no Layer**.

### D2. `yield* MyTag` — still works

`Context.Key<Identifier, Shape> extends Effect<Shape, never, Identifier>` (`Context.ts:68`), so the key is its own accessor:

```ts
const yielded: Effect.Effect<{ readonly region?: string }, never, Main> = Effect.gen(function* () {
  return yield* Main
})
```

Runtime, unprovided: throws `Error: Service not found: Main`. Provided: returns the value. `Effect.service(Main)` and `Effect.serviceOption(Main)` are equivalent explicit forms.

### D3. Removed

`Effect.provideLayer`, `Effect.withScheduler`, `Effect.locally`, `Effect.serviceMap`, `Effect.fork` are **absent** from `Effect.ts` in v4 (compile-verified as errors). Use `Effect.provide(layer)`, `RunOptions.scheduler`, `Effect.provideService(FiberRef…)`/`Effect.updateService`, and `forkChild`/`forkIn`/`forkScoped`/`forkDetach`.

---

## E. Scheduler and Clock

### E1. `Scheduler` — redesigned; there is no `scheduleTask` on it

```ts
// Scheduler.ts:34
export interface Scheduler {
  readonly executionMode: "sync" | "async"
  shouldYield(fiber: Fiber.Fiber<unknown, unknown>): boolean
  makeDispatcher(): SchedulerDispatcher
}

// Scheduler.ts:60
export interface SchedulerDispatcher {
  scheduleTask(task: () => void, priority: number): void
  flush(): void
}

// Scheduler.ts:82
export const Scheduler: Context.Reference<Scheduler> = Context.Reference<Scheduler>("effect/Scheduler", {
  fiberCached: true,
  defaultValue: () => new MixedScheduler()
})
```

`SchedulerDispatcher` has **priority-ordered buckets** (`PriorityBuckets`) and a synchronous `flush()`:

```ts
// Scheduler.ts, MixedSchedulerDispatcher.flush
flush() {
  while (this.tasks.buckets.length > 0) {
    if (this.running !== undefined) {
      this.running()
      this.running = undefined
    }
    this.runTasks()
  }
}
```

Measured default under `Effect.runSyncExit`:

```
mode: "sync"
hasMakeDispatcher: function
hasShouldYield:   function
hasScheduleTask:  undefined     // NOT on Scheduler
hasGetCurrentTime: undefined    // NOT on Scheduler
```

**Installation options** (there is no `Scheduler.make`, no `Scheduler.layer`, no `Runtime.setScheduler`, no `Effect.withScheduler`):

1. `Effect.provideService(program, Scheduler.Scheduler, impl)` — works (verified).
2. `Layer.succeed(Scheduler.Scheduler)(impl)` into a `ManagedRuntime`.
3. `Effect.runFork(effect, { scheduler })` / `ManagedRuntime.runFork(effect, { scheduler })` — `RunOptions.scheduler?: Scheduler` (`Effect.ts:9185`).

`Scheduler` is a `Context.Reference`, so a provided value wins and the `MixedScheduler` default otherwise applies.

**Critical for the tick design:** `runSyncExit` **ignores** the ambient scheduler. It constructs a private `MixedScheduler("sync")` and flushes it:

```ts
// internal/effect.ts:5882
export const runSyncExitWith = <R>(context: Context.Context<R>) => {
  const runFork = runForkWith(context)
  return <A, E>(effect: Effect.Effect<A, E, R>): Exit.Exit<A, E> => {
    if (effectIsExit(effect)) return effect
    const scheduler = new Scheduler.MixedScheduler("sync")
    const fiber = runFork(effect, { scheduler }) as FiberImpl<A, E>
    fiber._dispatcher?.flush()
    return fiber._exit ?? exitDie(new AsyncFiberError(fiber))
  }
}
```

Measured: with a counting Scheduler installed via `provideService`, `runSyncExit` called `makeDispatcher` **0 times**.

Other exported knobs: `Scheduler.MaxOpsBeforeYield` (`Scheduler.ts:294`, default 2048), `Scheduler.PreventSchedulerYield` (`Scheduler.ts:321`).

### E2. `Clock` — fully replaceable

```ts
// Clock.ts:53
export interface Clock {
  currentTimeMillisUnsafe(): number
  readonly currentTimeMillis: Effect<number>
  currentTimeNanosUnsafe(): bigint
  readonly currentTimeNanos: Effect<bigint>
  monotonicTimeNanosUnsafe(): bigint
  readonly monotonicTimeNanos: Effect<bigint>
  sleep(duration: Duration.Duration): Effect<void>
}

// Clock.ts:192
export const Clock: Context.Reference<Clock> = effect.ClockRef
```

Note the v4 change: `currentTimeNanos` is now **Unix** time; `monotonicTimeNanos` is new in `4.0.0` and is the one for elapsed-time math. There is **no `Clock.make`**; provide it with `Effect.provideService(Clock.Clock, impl)` or `Layer.succeed(Clock.Clock)(impl)`.

`Effect.sleep` **does** route through the service (measured: a provided `Clock.sleep` received `50` for `Effect.sleep("50 millis")` and returned immediately; `Clock.currentTimeMillis` read `20` from the fake). So a tick-pumped Clock is a viable way to make `Effect.sleep` tick-driven.

`TestClock` lives under `effect/testing` (not verified in detail here; the subpath is exported — `package.json` `"./testing"`).

### E3. `runSyncExit` / `runSync` semantics

```ts
// Effect.ts:9683
export const runSyncExit: <A, E>(effect: Effect<A, E>) => Exit.Exit<A, E>
// Effect.ts:9593
export const runSync: <A, E>(effect: Effect<A, E>) => A
```

`runSync` throws `causeSquash(exit.cause)` on failure; `runSyncExit` never throws. Anything left un-finished after the dispatcher flush becomes a **defect**:

```ts
// internal/effect.ts:6533
export class AsyncFiberError extends TaggedError("AsyncFiberError")<{
  fiber: Fiber.Fiber<unknown, unknown>
  message: string
}> {
  constructor(fiber) {
    super({ message: "An asynchronous Effect was executed with Effect.runSync", fiber })
  }
}
```

Measured matrix under `Effect.runSyncExit` on `4.1.2`:

| Effect | Result |
|---|---|
| `Effect.succeed(1)` | `Success(1)` |
| `Effect.fail("boom")` | `Failure`, reason `Fail` |
| `Effect.gen(… pure …)` | `Success` |
| `Effect.yieldNow` | `Success` |
| `Effect.forkChild(Effect.void)` | `Success` (Fiber returned; **already interrupted**) |
| `Effect.sleep("10 millis")` | `Failure`, reason `Die(AsyncFiberError)` |
| `Effect.tryPromise(() => Promise.resolve(1))` | `Failure`, reason `Die(AsyncFiberError)` |
| `Effect.never` | `Failure`, reason `Die(AsyncFiberError)` |

So: **timers, promises, and `never` suspend; `yieldNow` and `forkChild` do not.** A suspended fiber is left behind and reported as a defect carrying `.fiber`; `runSyncExit` does not wait for it. `Cause` exposes `isAsyncFiberError` (`Cause.ts`) so the host can distinguish "handler suspended" from a genuine failure.

### E4. Running Effect without an event loop

There is no supported "repeatedly-driven runtime" API. The only synchronous entry point is `runSyncExit`, and it hardcodes `MixedScheduler("sync")` + a single `flush()`. `MixedScheduler`'s `executionMode: "sync"` exists and is documented for Cloudflare Workers ("Use `new MixedScheduler("sync")` for the whole application", `Scheduler.ts` gotchas), but the documented recipe is still request-scoped `runPromise`, not a manual pump.

The practical v4 primitives for a tick host are therefore: (a) a provided `Clock` for time, (b) `ManagedRuntime.runFork` + `RunOptions.scheduler` for fibers, (c) `runSyncExit` for the sync-per-tick slice, and (d) a custom dispatcher whose `flush()` the tick calls. `Runtime.ts` in v4 exports only `Teardown`, `defaultTeardown`, `makeRunMain`, `errorExitCode`, and friends — **no `Runtime.setScheduler`, no `Runtime.defaultRuntime`**.

---

## F. Plugin / runtime shape

### F1. `ManagedRuntime`

```ts
// ManagedRuntime.ts:120
export interface ManagedRuntime<in R, out ER> {
  readonly [TypeId]: typeof TypeId
  readonly memoMap: Layer.MemoMap
  readonly contextEffect: Effect.Effect<Context.Context<R>, ER>
  readonly context: () => Promise<Context.Context<R>>
  readonly runFork: <A, E>(self: Effect.Effect<A, E, R>, options?: Effect.RunOptions) => Fiber.Fiber<A, E | ER>
  readonly runSyncExit: <A, E>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, ER | E>
  readonly runSync: <A, E>(effect: Effect.Effect<A, E, R>) => A
  readonly runCallback: <A, E>(effect, options?) => (interruptor?: number) => void
  readonly runPromise: <A, E>(effect: Effect.Effect<A, E, R>, options?: Effect.RunOptions) => Promise<A>
  readonly runPromiseExit: <A, E>(effect, options?) => Promise<Exit.Exit<A, ER | E>>
  readonly dispose: () => Promise<void>
  readonly [Symbol.asyncDispose]: () => Promise<void>
  readonly disposeEffect: Effect.Effect<void, never, never>
}

// ManagedRuntime.ts:325
export const make = <R, ER>(
  layer: Layer.Layer<R, ER, never>,
  options?: { readonly memoMap?: Layer.MemoMap | undefined } | undefined
): ManagedRuntime<R, ER>
```

Note: `make` takes a `Layer` whose requirement is `never` — the whole plugin graph must be closed.

**`ManagedRuntime.toLayer` does not exist** in v4 (runtime `undefined`; absent from the module). v3's `toLayer` has no replacement in the interface.

**Dispose is terminal.** Disposal overwrites `contextEffect` with a die and clears the cache:

```ts
// ManagedRuntime.ts:418-419
;(self as Mutable<ManagedRuntime<R, ER>>).contextEffect = Effect.die("ManagedRuntime disposed")
self.cachedContext = undefined
```

Measured: after `await rt.dispose()`, `rt.runSync(Effect.succeed(1))` throws (a `String` die: `ManagedRuntime disposed`), and `rt.contextEffect` is a `Failure`. **Rebuild means construct a new `ManagedRuntime.make(...)`** — verified over three create/use/dispose iterations, each returning the fresh layer value. So "one `ManagedRuntime` per plugin; dispose on teardown; rebuild on reload" works, but the *same* runtime object cannot be resurrected.

### F2. Streams

```ts
// Stream.ts:11378
export const runForEach: {
  <A, X, E2, R2>(f: (a: A) => Effect.Effect<X, E2, R2>):
    <E, R>(self: Stream<A, E, R>) => Effect.Effect<void, E2 | E, R2 | R>
  <A, E, R, X, E2, R2>(self: Stream<A, E, R>, f: (a: A) => Effect.Effect<X, E2, R2>):
    Effect.Effect<void, E | E2, R | R2>
}

// Stream.ts:11481 — chunk variant, f receives Arr.NonEmptyReadonlyArray<A>
export const runForEachArray: { ... } // same shape, f: (a: Arr.NonEmptyReadonlyArray<A>) => Effect<X, E2, R2>

// Stream.ts:11129
export const runCollect = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<Array<A>, E, R>

// Stream.ts:12228
export const toQueue: {
  (options: { readonly capacity: "unbounded" } | { readonly capacity: number; readonly strategy?: ... }):
    <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<Queue.Dequeue<A, E | Cause.Done>, never, R | Scope.Scope>
  <A, E, R>(self, options): Effect.Effect<Queue.Dequeue<A, E | Cause.Done>, never, R | Scope.Scope>
}
```

Confirmed: `Stream.runForEach(s, f)` returns an **`Effect`**, not a `Stream` — specifically `Effect<void, E|E2, R|R2>`. It is unbounded only because the stream is.

**Forking API renamed.** `Effect.fork` is gone; v4 has:

```ts
// Effect.ts:8935
export const forkChild: <Arg ...>(effectOrOptions?, options?) =>
  [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<Fiber<_A, _E>, never, _R>
    : <A, E, R>(self: Effect<A, E, R>) => Effect<Fiber<A, E>, never, R>

// Effect.ts:9023
export const forkScoped: <Arg ...>(effectOrOptions?, options?) =>
  [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<Fiber<_A, _E>, never, _R | Scope>
    : <A, E, R>(self: Effect<A, E, R>) => Effect<Fiber<A, E>, never, R | Scope>

// Effect.ts:9069  forkDetach — no parent, no scope
```

Idiomatic "run this stream for the lifetime of the scope", and it typechecks exactly as written:

```ts
const fs: Effect.Effect<Fiber.Fiber<void, never>, never, Scope.Scope> =
  Stream.runForEach(Stream.make(1), () => Effect.void).pipe(Effect.forkScoped)
```

Measured: an infinite `Stream` forked with `forkScoped` inside `Effect.scoped` runs, and `Fiber.interrupt` (or scope close) stops it. `Effect.never` exists (`Effect.ts:1313`, `Effect<never>`), `Effect.forever` exists (`Effect.ts:7882`).

---

## G. `effect/cli` surface

`src/cli/` contents on `main`: `Argument.ts`, `CliConfig.ts`, `CliError.ts`, `CliOutput.ts`, `Command.ts`, `Completions.ts`, `Flag.ts`, `GlobalFlag.ts`, `HelpDoc.ts`, `Param.ts`, `Primitive.ts`, `Prompt.ts`, `TerminalCapabilities.ts`.

**The `Argument`/`Flag` → `Args`/`Options` rename has NOT happened.** There is no `Args.ts` and no `Options.ts`; `cli/index.ts` re-exports `export * as Argument from "./Argument.ts"` and `export * as Flag from "./Flag.ts"`. The repo's `Argument.String("name")` / `Flag.String(...)` naming is the current v4 naming.

```ts
// cli/Command.ts:644
export const make: {
  <Name extends string>(name: Name): Command<Name, {}, {}, never, never>

  <Name extends string, const Config extends Command.Config>(
    name: Name,
    config: Config
  ): Command<Name, Command.Config.Infer<Config>, {}, never, never>

  <Name extends string, const Config extends Command.Config, R, E>(
    name: Name,
    config: Config,
    handler: (config: Command.Config.Infer<Config>) => Effect.Effect<void, E, R>
  ): Command<Name, Command.Config.Infer<Config>, {}, E, Exclude<R, BuiltInSettingContext>>
}

// cli/Command.ts:727
export const withHandler: {
  <A, R, E>(handler: (value: A) => Effect.Effect<void, E, R>):
    <Name extends string, XR, XE, ContextInput>(self: Command<Name, A, ContextInput, XE, XR>)
      => Command<Name, A, ContextInput, E, Exclude<R, BuiltInSettingContext>>
  <Name extends string, A, XR, XE, R, E, ContextInput>(
    self: Command<Name, A, ContextInput, XE, XR>,
    handler: (value: A) => Effect.Effect<void, E, R>
  ): Command<Name, A, ContextInput, E, Exclude<R, BuiltInSettingContext>>
}

// cli/Command.ts:960
export const withSubcommands: {
  <const Subcommands extends ReadonlyArray<Command.SubcommandEntry>>(subcommands: Subcommands):
    <Name extends string, Input, E, R, ContextInput>(self: Command<Name, Input, ContextInput, E, R>) => Command<
      Name,
      Simplify<Input | ContextInput>,
      ContextInput,
      E | ExtractSubcommandErrors<Subcommands>,
      R | Exclude<ExtractSubcommandContext<Subcommands>, CommandContext<Name>>
    >
  ...
}

// cli/Command.ts:1281
export const withDescription: {
  (description: string): <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>, description: string
  ): Command<Name, Input, ContextInput, E, R>
}
```

- `Command.Config` is a (nestable) record of `Flag`/`Argument` params; `Command.Config.Infer<Config>` converts it to plain values (`cli/Command.ts:290+`). So `Command.make("set", { name: Argument.String("name") }, ({ name }) => …)` is the real shape — matching `commands.md`.
- **A handler can require a service.** The handler is `(input) => Effect<void, E, R>` and the command carries `E`/`Exclude<R, BuiltInSettingContext>`; `Command.run`/`runWith` then require `R`. Confirmed in the type above.
- `Command.run` / `Command.runWith` exist (`cli/Command.ts:1933`, `:2027`).
- `Command.permission(...)` does **not** exist in effect/cli — that is this repo's own extension.

---

## H. Alchemy

Checked `sam-goodwin/alchemy` `main` (package `alchemy@0.94.0`).

**`Plugin` does not exist.** Exhaustive filename scan of the 3,522-file tree finds "plugin" only in esbuild/Vite adapter files (`alchemy/src/cloudflare/vite/plugin.ts`, `bundle/plugin-*.ts`, `astro/plugin.ts`, `nuxt/plugin.ts`, …) and unrelated docs pages. `alchemy/src/index.ts` exports: `AlchemyOptions`, `Phase`, `context`, `resource`, `scope`, `secret`, `serde`, `state`, `type`, `util/ignore`, `util/logger`, default `alchemy`.

**`Test.make` does not exist.** The test surface is a Vitest-coupled function:

```ts
// alchemy/src/test/vitest.ts
export function test(meta: ImportMeta, defaultOptions: TestOptions = { quiet: true }): test
// where `test` has: (name, fn, timeout?) | (name, options, fn, timeout?),
//   .skipIf(cond), .skip, .beforeAll(fn), .afterAll(fn), .scope
// wired as: alchemy.test = test
```

Usage is `const test = alchemy.test(import.meta, { prefix })`, then `test("name", async (scope) => { … await alchemy.destroy(scope) })`. It manages an Alchemy `Scope`/state store, nothing to do with Effect.

**The "soft dependency as an `R` requirement, `X.layer()` satisfies it" pattern is not Alchemy's.** `alchemy@0.94.0` has **no `effect` dependency** (deps are `@aws-sdk/*`, `wrangler`, `miniflare`, `esbuild`, `drizzle-orm`, …; peers are framework adapters), and there is no `.layer()` on resources. What Alchemy actually has is *resource providers* with scopes and phases:

```ts
// alchemy/src/resource.ts
export type DynamicResourceResolver
export function registerDynamicResource
export function resolveDeletionHandler
export interface Provider { ... }
export interface Resource { ... }
export function Resource(...)
```

So the repo's `integrations.md` line — "Each package exports one `X.layer()`. … (Alchemy's provider pattern)" — attributes an Effect-specific mechanism to Alchemy that Alchemy does not implement. The *mechanism* is real **in Effect** (`Layer.provide` / `Effect.provide` narrow `R`); the *attribution* to Alchemy is wrong, and there is no `Plugin(...)` or `Test.make` to borrow shape from.

---

## I. Contradictions in the repo docs

### `apps/docs/design/effect.md`

| Claim | Verdict |
|---|---|
| "**Effect v4.** Services are tags, and implementations are Layers." | **CONFIRMED** — keys are `Context.Service`/`Context.Reference`; `Layer.effect(Service, Service.make)` is the pattern. ("tags" is v3 vocabulary; `Context.Tag` no longer exists.) |
| "One `ManagedRuntime` per plugin. Disposing it is the first step of teardown." | **CONFIRMED** — `ManagedRuntime.make(layer)`, `dispose(): Promise<void>`, `disposeEffect`. Caveat: disposal is terminal (`ManagedRuntime.ts:418`); reload must build a new runtime. |
| "Tick Scheduler and Clock … the host provides an Effect Scheduler and Clock that the Paper tick pumps" | **PARTLY CONTRADICTED** — Clock: yes (`Clock` is a `Context.Reference`; `Effect.sleep` calls `Clock.sleep`). Scheduler: the `Scheduler` interface has no `scheduleTask`/`getCurrentTime`, only `makeDispatcher()`; and `runSyncExit` **throws away** any ambient Scheduler, constructing `new MixedScheduler("sync")` itself. A tick Scheduler can drive forked fibers (`RunOptions.scheduler`) but never the `runSyncExit` path. |
| "it drains promise microtasks on every tick" | **CONTRADICTED for Effect** — Effect does not drain microtasks. Promise-backed effects (`Effect.tryPromise`) become `Die(AsyncFiberError)` under `runSyncExit`; nothing in Effect resumes them outside the JS engine. That is the host's job (Graal), not an Effect feature. |
| "Thread boundaries live in `R` as `Main` / `AsyncThread`." | **CONFIRMED** — a service key can be a requirement; `Effect.provideService` narrows `R` by `Exclude<R, I>`. |
| "`yield* Paper.offload(db.fetchHomes(uuid)) // Java pool; resumes without Main`" | **UNVERIFIED** — repo API, no Effect primitive claimed. (The "resumes without `Main`" half is expressible: omit `Main` from the returned effect's `R`.) |
| "Each integration's `X.layer()` satisfies its requirement." | **CONFIRMED as Effect mechanics / CONTRADICTED as `Context.Service` API** — `Layer.provide` satisfies `R`, but `Context.Service` does **not** generate `.layer`; you must define `Layer` values yourself. |
| "`Effect.withSpan` on commands and handlers" | **CONFIRMED** — `Effect.withSpan` exported (`Effect.ts`); `Effect.withSpanScoped` also exists. |
| "`Observability.layer` can be swapped out." | **UNVERIFIED** — `effect/observability` subpath exists; no such export was checked. |

### `apps/docs/design/threading.md`

| Claim | Verdict |
|---|---|
| `class Main extends Context.Tag("Main")<Main, { readonly region?: Entity \| Location }>() {}` | **CONTRADICTED** — `Context.Tag` does not exist in v4 (`undefined` at runtime, TS2339 at compile). v3 syntax. Correct: `class Main extends Context.Service<Main, { readonly region?: Entity \| Location }>()("Main") {}`. |
| `class AsyncThread extends Context.Tag("AsyncThread")<AsyncThread, void>() {}` | **CONTRADICTED** — same; use `Context.Service<AsyncThread, void>()("AsyncThread")`. Note `Context.Service<X>()("X")` with no options is a compile error (TS2554): the two-generic form is mandatory without `make`. |
| "`yield* Main` declares a requirement (and reads the service)." | **CONFIRMED** — `Key extends Effect<Shape, never, Identifier>`; `Effect.service(Main)` is the explicit form. |
| "A bare `yield* Main` with no provider in scope fails as a missing service. It doesn't hop." | **CONFIRMED** — runtime: `Error: Service not found: Main`. |
| "`Paper.on` … provides `Main`" | **CONFIRMED mechanism** — `Effect.provideService(self, Main, value): Effect<A, E, Exclude<R, Main>>` requires no Layer. |
| "Effect synchrony: `runSyncExit` compared with a suspended fiber. A sleep, offload, or fork ends it." | **CONTRADICTED for "fork"** — `Effect.forkChild(Effect.void)` under `runSyncExit` returns `Success`, not `Die(AsyncFiberError)`. `sleep` and promise-based effects do end the window. |
| "In dev builds, calling a `Main` façade without `Main` throws `ThreadBoundaryError` at runtime." | **NOT AN EFFECT BEHAVIOUR** — Effect throws a plain `Error("Service not found: Main")`. `ThreadBoundaryError` would have to be produced by the façade itself. |
| "`yield* e.cancel // SyncWindow + Main`" | **UNVERIFIED** — repo API. |

### `apps/docs/design/events.md`

| Claim | Verdict |
|---|---|
| "The host pushes each Bukkit dispatch into the stream with `runSyncExit` **before the Java listener returns**." | **MECHANICALLY POSSIBLE, with two caveats** — (1) `runSyncExit` ignores the ambient Scheduler entirely; (2) any handler that sleeps, awaits a promise, or yields `never` yields `Exit.Die(AsyncFiberError)` rather than a suspension you can await. That is a workable "did the handler suspend?" detector, but it is a defect channel, not a normal `Exit`. |
| "`event.cancel` requires `SyncWindow` in `R`. `SyncWindow` is present only during that unbuffered sync push." | **UNVERIFIED** — repo API. (Provisioning a marker service for a scoped call is straightforward with `provideService`.) |
| "This matches MCCoroutine: the first real suspend ends the window." | **UNVERIFIED** — external system, not checked. |
| "`yield* Events.playerJoined.pipe(Stream.runForEach(onJoin))`" | **CONFIRMED** — `Stream.runForEach(stream, f): Effect<void, E|E2, R|R2>`, so the pipe yields an `Effect` you can `yield*`. |
| "`Events.of(BlockBreakEvent, { priority: "high", ignoreCancelled: true })`" | **UNVERIFIED** — repo API. |

### `apps/docs/design/commands.md`

| Claim | Verdict |
|---|---|
| "inspired by effect/cli: `Command.make`, `Flag` / `Argument`, subcommands" | **CONFIRMED, and the names are current** — v4.1.2's `effect/cli` still ships `Argument.ts` and `Flag.ts`. No `Args`/`Options` rename exists. |
| `Command.make("set", { name: Argument.String("name") }, (config) => Effect.gen(...))` | **CONFIRMED** — matches `Command.make<Name, Config, R, E>(name, config, handler)` where `handler: (config: Config.Infer) => Effect<void, E, R>`. |
| "`Command.withSubcommands([set])`" | **CONFIRMED** — `withSubcommands(subcommands)` data-last, merges subcommand `R`/`E`. |
| "`Command.withDescription("Manage warps")`" | **CONFIRMED**. |
| "`Command.permission("effectmc.warp")`" | **NOT IN effect/cli** — no `permission` export; repo extension. |
| "Commands execute with `Main` in `R`." | **CONFIRMED as a pattern** — handler `R` is preserved (`Exclude<R, BuiltInSettingContext>`), so `Main` propagates to `Command.run`. |
| "Unit-test with `Command.runWith`-style fake arguments." | **CONFIRMED** — `Command.runWith(command, { version })(argv)` exists (`cli/Command.ts:2027`). |
| "Suggestions may run off-main." | **UNVERIFIED** — repo/Paper concern. |

### `apps/docs/patterns/services.md`

| Claim | Verdict |
|---|---|
| "These are Effect v4 tags and Layers." | **CONFIRMED**. |
| `class WarpService extends Context.Service<WarpService>()("@homes/WarpService", { make: Effect.gen(...) }) {}` | **CONFIRMED verbatim** — this is overload 3; `Shape` is inferred from the `make` effect; the `{}` body is required. |
| `WarpService.make` is usable as an `Effect` | **CONFIRMED** — runtime `Effect.isEffect(WarpService.make) === true`. |
| `Layer.effect(WarpService, WarpService.make)` | **CONFIRMED** — `Layer.effect<I,S,E,R>(service, effect): Layer<I, E, Exclude<R, Scope>>`. |
| "each one's `X.layer()` satisfies it" | **CONTRADICTED for `Context.Service`** — no `.layer` is generated (`"layer" in WarpService === false`). Must be hand-written, as this file correctly does. |
| `class WarpNotFound extends Schema.TaggedError<WarpNotFound>()("WarpNotFound", { name: Schema.String }) {}` | **CONFIRMED syntactically**, but the `name` field **overwrites `Error.name`**: `e.name === "home"`, `e.toString() === "home"`, `e.message === ""`. |
| `Effect.fail(new WarpNotFound({ name }))`, `Effect.catchTag(...)` | **CONFIRMED** — the class is a `YieldableError`; `catchTag` matches `_tag`. |
| `Ref.make`, `Ref.get`, `Ref.update`, `Option.fromNullable`, `Option.match` | **UNVERIFIED in detail** (not part of this pass). |

### `apps/docs/patterns/errors.md`

| Claim | Verdict |
|---|---|
| "Use tagged errors" with `Schema.TaggedError<T>()(tag, fields)` | **CONFIRMED** — `Schema.ts:17905`. |
| `Effect.catchTag("PdcDecodeError", (e) => ...)` | **CONFIRMED** — matches on `_tag`; the callback's `e` is narrowed to the class instance. |
| "`SqlError` from `@effect/sql`" | **CONTRADICTED for v4** — `@effect/sql@0.52.1` pins `"effect": "^3.22.1"` (v3 line). In v4, `SqlError` ships inside the main package at `effect/sql/SqlError` (`class SqlError extends Schema.TaggedError<SqlError>("effect/sql/SqlError")("SqlError", {...})`). Importing `@effect/sql` alongside `effect@4` mixes majors. |
| "`PermissionDenied`, `ThreadBoundaryError`" | **UNVERIFIED / repo-defined** — neither is an Effect export. |

---

## What this breaks in the current docs

1. **`threading.md` — both tag declarations are v3 and will not compile.** `Context.Tag` was removed in v4. Rewrite to `Context.Service<Main, { region?: Entity | Location }>()("Main")` and `Context.Service<AsyncThread, void>()("AsyncThread")`. Note `Context.Service<X>()("X")` (one generic, no `make`) is a TS2554 error, so `AsyncThread` **needs** the explicit `void` shape generic.

2. **`services.md` (and `effect.md` §"Capabilities in R") — "each one's `X.layer()`" is not a `Context.Service` feature.** `.make` is generated; `.layer` is not. Every integration package must export a hand-written `Layer`, so the "one `X.layer()` per package" contract is a convention the framework enforces, not something Effect gives you.

3. **`effect.md` — "the host provides an Effect Scheduler … that the Paper tick pumps" cannot reach `runSyncExit`.** `internal/effect.ts:5886` always builds `new Scheduler.MixedScheduler("sync")` and flushes once. A custom Scheduler only applies to `Effect.runFork` / `ManagedRuntime.runFork` via `RunOptions.scheduler`. The tick design has to be split: custom Scheduler for fibers, `runSyncExit` for the synchronous slice, and a custom **Clock** for time (that one does work).

4. **`effect.md` — "drains promise microtasks on every tick" is not an Effect capability.** Promise-backed work is `Die(AsyncFiberError)` under `runSyncExit`. If the host needs promise interop, that is Graal-side machinery; Effect will not drain anything.

5. **`threading.md` — "a sleep, offload, or **fork** ends the sync window" is wrong about forks.** Measured: `Effect.forkChild(Effect.void)` inside `runSyncExit` returns `Success`. Only timers, promises, and `never` produce `Die(AsyncFiberError)`. `SyncWindow` semantics built on "fork ends the window" will not behave as documented.

6. **`threading.md` — "throws `ThreadBoundaryError`" is not what a missing service does.** Effect throws `Error: Service not found: Main`. The façade must catch and translate.

7. **`services.md` / `errors.md` — the `name` field on a `TaggedError` silently replaces `Error.name`.** `new WarpNotFound({ name: "home" }).name === "home"`, `.toString() === "home"`, `.message === ""`. Any log line or Adventure renderer that prints `err.name` expecting the tag will print the warp name. `catchTag`/`_tag` are unaffected.

8. **`errors.md` — `SqlError` from `@effect/sql` is the v3 package.** `@effect/sql@0.52.1` depends on `effect@^3.22.1`. On v4 it is `effect/sql/SqlError`.

9. **`commands.md` — `Command.permission` is not effect/cli.** Everything else in that file (`Command.make(name, config, handler)`, `withSubcommands`, `withDescription`, `Argument.String`, `Flag`, handler `R`) matches v4 exactly. Also note the `Argument`/`Flag` → `Args`/`Options` rename is **not real**: `src/cli/` still has `Argument.ts` and `Flag.ts`.

10. **`integrations.md` / `overview.md` / `decisions.md` — the Alchemy attributions do not exist.** `sam-goodwin/alchemy@0.94.0` has no `Plugin(...)`, no `Test.make`, no `X.layer()`, and no `effect` dependency. Alchemy's actual split is resources + providers + scopes/phases (`alchemy/src/resource.ts`), and its test helper is `alchemy.test(import.meta, opts)` (Vitest-only). The `R`-narrowing pattern is Effect's (`Layer.provide`), not borrowed.

11. **API-churn items not currently in the docs but that will bite the framework code:** `Effect.fork` → `forkChild`/`forkIn`/`forkScoped`/`forkDetach`; `Effect.yieldNow` is a **value** (`Effect.yieldNow`, not `yieldNow()`); `Effect.provideLayer` → `Effect.provide`; `ManagedRuntime.toLayer` does not exist; `Runtime.setScheduler` does not exist; `Clock.currentTimeNanos` is now Unix time and `Clock.monotonicTimeNanos` is the monotonic one.
