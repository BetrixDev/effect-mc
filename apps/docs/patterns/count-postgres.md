---
title: /count on Postgres
description: A persisted counter with @effect/sql-pg.
---

# /count on Postgres

> **Superseded.** Primary-source research in `docs/research/` contradicted several claims on this page, and `docs/adr/` records what replaced them. It is kept for context and will be rewritten when the v0 API spec lands.

This plugin provides `/count`, `/count inc`, and `/count dec`. The counter lives in Postgres and is reached through the portable `SqlClient` API, with `PgClient.layerConfig` from `@effect/sql-pg`. SQL doesn't require `Main`. Messaging the player does.

```typescript
import { Effect, Layer, Redacted, Schema, Config } from "effect"
import { SqlClient } from "@effect/sql" // or effect/sql — same service
import { PgClient } from "@effect/sql-pg"
import { Argument, Command } from "@effectmc/commands"
import { EffectMC, Commands, Sender, Paper } from "@effectmc/core"

// --- persistence (no Main in R) ---------------------------------
const SqlLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
})

const migrate = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE IF NOT EXISTS counters (
      id    INT PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT 0
    )
  `
  yield* sql`
    INSERT INTO counters (id, value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING
  `
})

const readCount = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ value: string }>`
    SELECT value::text AS value FROM counters WHERE id = 1
  `
  return Number(rows[0]?.value ?? 0)
})

const bump = (delta: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ value: string }>`
      UPDATE counters
      SET value = value + ${delta}
      WHERE id = 1
      RETURNING value::text AS value
    `
    return Number(rows[0].value)
  })

// --- commands (execute with Main; drop it for SQL) --------------
const countRoot = Command.make("count").pipe(
  Command.withDescription("Postgres-backed counter"),
  Command.permission("demo.count"),
)

const show = Command.make("", {}, () =>
  Effect.gen(function* () {
    // Fiber suspends on I/O — do not hold world work across this
    const value = yield* readCount
    yield* Sender.succeedMessage(`count = ${value}`) // Main OK for Adventure
  }),
)

const inc = Command.make("inc", {}, () =>
  Effect.gen(function* () {
    const value = yield* bump(1)
    yield* Sender.succeedMessage(`count = ${value}`)
  }),
)

const dec = Command.make("dec", {}, () =>
  Effect.gen(function* () {
    const value = yield* bump(-1)
    yield* Sender.succeedMessage(`count = ${value}`)
  }),
)

export const CountRoot = countRoot.pipe(
  Command.withSubcommands([inc, dec]),
  // bare /count → show (handler on the root)
  Command.withHandler(show),
)

// --- plugin -----------------------------------------------------
EffectMC.Plugin("count", SqlLive, Effect.gen(function* () {
  yield* migrate
  yield* Commands.register(CountRoot)
}))
```

## Thread story

`SqlClient` queries are typed without `Main`, because they're just Effect I/O. Command dispatch still starts on the server thread, but the fiber suspends while the pool talks to Postgres, so the tick keeps going. Reply with `Sender.*`, or with `Paper.on(player, …)` if you left `Main`. Never call Bukkit world APIs in the same uninterrupted stretch as a query. Hop back explicitly with `Paper.on`.

## Graal and `@effect/sql-pg`

> Author code targets `SqlClient`. `@effect/sql-pg` is the default Live layer when the host can run its native wire client (async TCP plus the tick promise drain). If GraalJS networking isn't enough, EffectMC ships a drop-in `Sql.jdbcPg` Layer. It implements the same `SqlClient` over Hikari/JDBC inside `Paper.offload`, so plugins keep the same `` sql`…` `` code.

## Notes

- **Config:** read `Config.redacted("DATABASE_URL")` from the vault or environment, never from chat.
- **Migrations:** this demo uses tiny inline SQL. Real plugins use the `@effect/sql` migrator.
- **Errors:** catch `SqlError` by tag at the command boundary and render it as an Adventure message.
- **Tests:** swap `SqlLive` for `@effect/sql-sqlite-*` or an in-memory Layer. The commands don't change.
