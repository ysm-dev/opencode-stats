# Drizzle on the Effect 4 SQL client

## Direct answer

Research for [#16, “What is the stats store, and how does it stay in sync?”](https://github.com/ysm-dev/opencode-stats/issues/16). This establishes compatibility facts; it does **not** choose the stats store architecture or sync algorithm.

- **A published driver already exists.** `drizzle-orm@1.0.0-rc.5-5935859` has `effect-sqlite-bun` and `effect-sqlite-node`. Both ran against Effect **4.0.0 stable** and matching 4.0.0 SQLite adapters without changing any Drizzle JavaScript. OpenCode's pinned ORM, `1.0.0-rc.5-169397b`, also passed the initial CRUD/transaction/JSON/read-only spike. These are prerelease Drizzle builds, not `latest`. [registry] [drivers]
- **Runtime compatibility is not complete declaration compatibility.** The published SQLite declarations still import `effect/unstable/sql/SqlError`. Stable exposes **`effect/sql/SqlClient`** and **`effect/sql/SqlError`**, not the old paths. Four one-line declaration changes repair the ESM Bun+Node SQLite surface tested here; no runtime rewrite or vendored adapter is needed for these operations. `skipLibCheck: true`, which this repo already uses, hides the stale dependency declarations. [stable] [types]
- **The requested operations passed on Bun 1.4.2 and Node 24.15.0:** two TypeScript tables, generated schema, insert, upsert, delete, typed select, committed transaction, explicit rollback, Drizzle `sql` with `json_extract`, generic SQL template with `json_extract`, and a separate synthetic SQLite file opened read-only that rejected inserts. The same operations passed inside a Bun `Worker`.
- **Consumer gates passed:** repository-configured type-aware oxlint with no suppressions, TypeScript 7.0.2's native compiler, and Vitest 5.0.2/V8 coverage at **100% per file** for the small consumer and schema modules. This is not a claim that all eight gates, or the adapter's whole API, were tested.
- **No migration history is necessary.** Drizzle Kit `export` produces full-schema SQL without a database connection; its published `drizzle-kit/cli` SDK `exportSql` returns individual statements. A generation-time SQL file with explicit statement breakpoints, or a generated TypeScript statement array, can be executed at runtime through Effect. Do not feed a multi-statement SQL file to `SqlClient.unsafe` and assume it executes everything. [export] [sdk]
- **Vendoring has a measurable cost, but is not the only route.** OpenCode's subtree contains **15 TypeScript files, 2,735 source lines, 105 explicit `any` violations, and no files over 499 lines**. Its README contributes another 35 lines. The fork with five SQL import-path substitutions also passed Bun and Node smoke tests. `@opencode/core@2.0.22` publishes the fork, but depends on **Effect 4.0.0-rc.112**, not stable. [opencode-fork] [core-npm]

## Environment and source pins

Local research date: **2026-10-03**; registry inspection completed around **2026-10-02T16:09Z**. Dates below are publication dates in UTC, not dist-tag assignment dates (the registry does not expose a tag-change history).

| Item                            | Version / revision                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Platform                        | macOS arm64                                                                            |
| Bun / Node                      | 1.4.2 / 24.15.0                                                                        |
| Effect, sqlite-bun, sqlite-node | All 4.0.0; adapters declare `effect: ^4.0.0`                                           |
| Final upstream spike            | ORM and Kit both `1.0.0-rc.5-5935859`                                                  |
| Initial OpenCode-pin spike      | ORM `1.0.0-rc.5-169397b`, Kit `1.0.0-rc.5-ab785fc`                                     |
| Vitest / coverage-v8            | Both 5.0.2                                                                             |
| TypeScript / oxlint / tsgolint  | 7.0.2 / 1.86.0 / 7.0.2003                                                              |
| Complexity plugin / Node types  | 3.0.1 / 26.6.3                                                                         |
| opencode-stats base             | `main`, `68735ee`; worktree branch `research/drizzle-effect-sql`                       |
| OpenCode inspected read-only    | `~/git/opencode`, branch `v2`, `d259ae716379a67bcc35943ba75590f1fc7a1b26`, core 2.0.22 |
| Drizzle rc5 source              | `59358596b5be6a79f9cc1a2a20d39d276f6ab4b5`                                             |
| Drizzle OpenCode-pin source     | `169397b7e4aa14bcaf91214b98c51648d874bb05`                                             |

All fixtures and dependencies stayed under `/private/var/folders/f_/mpd_wxpx37nb3c44n96b_6pw0000gn/T/opencode/scratch-drizzle-effect-sql/`. The worktree was separate from the spike. No real OpenCode database was opened, no OpenCode checkout files were edited, and no spike source or dependency was committed.

## 1. What npm publishes

The full registry manifests reported **564 ORM versions**. Relevant tags were:

| Dist-tag                                   | ORM version           | ORM publication | Kit version          | Kit publication |
| ------------------------------------------ | --------------------- | --------------- | -------------------- | --------------- |
| `latest`                                   | 0.45.3                | 2026-09-21      | 0.31.11              | 2026-09-21      |
| `effect`                                   | 1.0.0-beta.1-cdf226f  | 2025-09-12      | Same version         | 2025-09-12      |
| `effect3`                                  | 1.0.0-beta.9-635dfc2  | 2026-01-06      | Same version         | 2026-01-06      |
| `effect-fixes`                             | 1.0.0-beta.10-9f1399e | 2026-01-09      | Same version         | 2026-01-09      |
| `effect-cache-fix`                         | 1.0.0-beta.11-88ca292 | 2026-01-15      | Same version         | 2026-01-15      |
| `drizzle-effect`                           | 1.0.0-beta.13-f16bdca | 2026-02-02      | Same version         | 2026-02-02      |
| `effect-validator`                         | 1.0.0-beta.14-56118cc | 2026-02-04      | Same version         | 2026-02-04      |
| `beta`                                     | 1.0.0-beta.22         | 2026-04-16      | Same version         | 2026-04-16      |
| `rc4`                                      | 1.0.0-rc.4-5d5b77c    | 2026-05-20      | Same version         | 2026-05-20      |
| `rc`                                       | 1.0.0-rc.4            | 2026-06-27      | Same version         | 2026-06-27      |
| `postgres`                                 | 1.0.0-rc.4-fb12281    | 2026-08-05      | No corresponding tag | —               |
| `rc5`                                      | 1.0.0-rc.5-5935859    | 2026-09-09      | Same version         | 2026-09-09      |
| OpenCode's explicit pin, not a current tag | 1.0.0-rc.5-169397b    | 2026-08-12      | 1.0.0-rc.5-ab785fc   | 2026-08-11      |

In particular, `rc4` and `rc` are **different builds**. A tag containing “effect” is not evidence of Effect 4 support. None of the inspected ORM publications was dated after stable Effect 4's 2026-10-01 publication. [registry]

### Entrypoints, peers and actual imports

Registry tarballs, not just manifest export keys, were inspected. Recent ORM builds use a wildcard `./*` export: an empty list of explicitly named Effect exports is **not** evidence that the files are absent.

| Build family inspected                                                           | Published entrypoints                                                                                                      | Effect-related peers                                                           | Actual SQL imports                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `latest` 0.45.3                                                                  | No Effect integration                                                                                                      | No Effect peers                                                                | None                                                                                        |
| `effect` beta.1-cdf226f                                                          | `effect/sqlite`, driver/session/db and select builder; not modern `effect-sqlite-*`                                        | `effect >=3.17.13`, `@effect/sql >=0.44.2`, `@effect/sql-sqlite-node >=0.45.2` | `@effect/sql/SqlClient`, `@effect/sql/SqlError`, Node adapter service: Effect 3 integration |
| `effect3` beta.9-635dfc2                                                         | `effect-postgres`, `pg-core/effect`, `effect-core/query-effect`, `cache/core/cache-effect`; no SQLite driver               | `@effect/sql ^0.48.5`, `@effect/sql-pg ^0.49.7`; **no declared `effect` peer** | `@effect/sql/SqlError`, `@effect/sql-pg/PgClient`                                           |
| `effect-fixes`, `effect-cache-fix`, `drizzle-effect`, `effect-validator`, `beta` | Above, plus `effect-core`; validator adds `effect-schema`; no SQLite driver                                                | Same SQL peers, no declared `effect` peer                                      | Effect 3 SQL package paths                                                                  |
| `rc` 1.0.0-rc.4                                                                  | `effect-core`, `effect-postgres`, `sqlite-core/effect`, cache-effect, `effect-sqlite-bun/node/do/wasm`, other SQL adapters | `effect` and SQL adapters: `>=4.0.0-beta.83                                    |                                                                                             | >=4.0.0`; no `@effect/sql` peer    | Runtime-specific adapter services; declarations import `effect/unstable/sql/SqlError` |
| `rc5` and OpenCode's ORM pin                                                     | Same modern SQLite family, through wildcard exports                                                                        | `effect` and SQL adapters: `>=4.0.0-beta.105                                   |                                                                                             | >=4.0.0`; all these peers optional | Same adapter services and stale declaration-only SqlError path                        |

The bare **`drizzle-orm/effect-sqlite`** entrypoint was not present in these tarballs. OpenCode's `effect-sqlite` is its **local generic-client fork**, not the published runtime-specific upstream entrypoint. Drizzle Kit is a schema/migration tool, not an Effect runtime driver; its inspected manifests declare no Effect/SQL peers. [early] [effect3] [drivers] [registry]

For the bounded “is there any published stable driver?” search, all 36 ORM manifests explicitly declaring an Effect 4 peer were examined. Exactly seven had modern SQLite exports or wildcard exports; each was inspected: `1.0.0-rc.4`, `rc.4-de6c356`, `rc.4-bfc7cd0`, `rc.4-fb12281`, `rc.5-ab785fc`, `rc.5-169397b`, `rc.5-5935859`. Every one retained the old SqlError declaration path. This does not exhaustively characterize untagged experimental packages with no Effect peer declaration.

## 2. Stable Effect 4 and the smallest verified change

Stable's generic service is:

```ts
import * as SqlClient from "effect/sql/SqlClient";
const client = yield * SqlClient.SqlClient;
```

Both stable adapter layers provide their own `SqliteClient` service **and** the generic `SqlClient`. Upstream Drizzle factories specifically obtain the Node or Bun **adapter service**, then use its generic-client methods (`unsafe`, `.values`, `.raw`, `.withoutTransform`, `withTransaction`). They do not obtain generic `SqlClient` directly. OpenCode's fork does. Choose the corresponding runtime import at the edge; never load the Bun driver on Node. [stable] [drivers] [opencode-fork]

**Unmodified runtime: yes. Fully resolving unmodified SQLite declarations against stable: no build found in the audited set.** In the two tested rc5 distributions, none of the executed SQLite JavaScript imports `effect/unstable/sql`; the obsolete imports survive in `.d.ts` files. A compiler audit with `skipLibCheck: false` exposed TS2307 even though the repo-style compiler and oxlint runs passed.

For the ESM SQLite surface used by both runtimes, replace one import in each of these four files:

```text
effect-sqlite-node/session.d.ts
effect-sqlite-bun/session.d.ts
sqlite-core/effect/db.d.ts
sqlite-core/effect/session.d.ts

effect/unstable/sql/SqlError -> effect/sql/SqlError
```

No JavaScript change was needed. CJS consumers would need the corresponding `.d.cts` fixes. Importing migrators or other dialects adds further old SqlError references: there are 23 occurrences across all rc5 `.d.ts` files, not just four. This spike does not propose a landed dependency patch or a gate exception.

With all repo-style strictness options enabled, `skipLibCheck: false` also found unrelated optional MySQL dependency imports and PostgreSQL/Cockroach `exactOptionalPropertyTypes` declaration errors. After the four substitutions, the SQLite SqlError TS2307 errors disappeared; those unrelated full-library audit failures remained. Do not represent this as a full-package declaration audit passing. An additional compile-time `IsAny` check of the consumer's Effect success/error types passed; it does not replace dependency-export validation.

Alternative checked: copy OpenCode's fork to scratch, replace `effect/unstable/sql` with `effect/sql` in five import occurrences across four files, and run the same smoke tests. It passed Bun directly and Node through Vitest's TypeScript loader. There were no other fork logic edits. Node's native TypeScript execution does not itself remap the fork's relative `.js` imports to `.ts`; the loader distinction matters.

## 3. Spike results

| Check                                           | Bun 1.4.2                                      | Node 24.15.0                                                          |
| ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Two `sqliteTable` definitions, generated DDL    | Passed                                         | Passed                                                                |
| Insert then upsert id 1, count 2 → 3            | Passed                                         | Passed                                                                |
| Transaction inserts id 2, then delete id 2      | Passed                                         | Passed                                                                |
| Drizzle select + `sql<number>` JSON expression  | `[{count:3,tokens:42}]`                        | Same                                                                  |
| Generic SQL tagged template                     | `[{tokens:42}]`                                | Same values; native rows have null prototypes                         |
| Transaction inserts id 99 then `tx.rollback()`  | Failure exit; only id 1 remains                | Same                                                                  |
| Separate `.source` SQLite file, `readonly:true` | Read and transaction read passed; write failed | Same                                                                  |
| Native read-only failure evidence               | `SQLITE_READONLY`, errno 8                     | `ERR_SQLITE_ERROR`, errcode 8, “attempt to write a readonly database” |
| Full operation fixture in Bun Worker            | Passed, including read-only file               | Not run in Node Worker                                                |
| OpenCode fork with stable SQL paths             | Passed                                         | Passed in Vitest                                                      |

The synthetic stats-store connection was scoped and closed before copying its file to a separate synthetic source fixture. WAL was disabled for these fixtures. Read-only configuration was `{ readonly: true, disableWAL: true, busyTimeout: "20 millis" }` in the direct runners. A second probe serialized the insert failure to verify SQLite's read-only code, rather than merely asserting that some Effect failed. Stable SQL wrapped this as `SqlError` with `UnknownError` reason, then Drizzle wrapped it as `EffectDrizzleQueryError`; do not assume a dedicated read-only reason tag.

### Exact reproduction commands

In a fresh scratch directory containing `{"private":true,"type":"module"}`:

```sh
bun add --exact effect@4.0.0 @effect/sql-sqlite-bun@4.0.0 @effect/sql-sqlite-node@4.0.0 \
  drizzle-orm@1.0.0-rc.5-5935859 drizzle-kit@1.0.0-rc.5-5935859 \
  vitest@5.0.2 @vitest/coverage-v8@5.0.2 typescript@7.0.2 \
  oxlint@1.86.0 oxlint-tsgolint@7.0.2003 oxlint-plugin-complexity@3.0.1 @types/node@26.6.3
node generate-schema.ts
bun drizzle-kit export --config drizzle.config.ts --output json > schema.json
node run-node.ts fixture-node-final.sqlite
bun run-bun.ts fixture-bun-final.sqlite
bun run-worker.ts
bunx --no-install oxlint --type-aware --report-unused-disable-directives \
  consumer.ts consumer-bun.ts schema.ts consumer.test.ts type-proof.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck false
node node_modules/vitest/vitest.mjs run consumer.test.ts --coverage
```

The explicit library audit fails as described above; run it before and after the four declaration import substitutions. The repo uses `typescript@7.0.2`'s **`tsc` executable**, not a separate `tsgo` package. Inspection of `typescript/lib/tsc.js` verified it executes the native Go compiler; this is the requested TS7 compiler, not the old JavaScript compiler.

Essential fixture inputs follow; these are reproduction excerpts inside this document, not retained spike files.

```ts
// schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const totals = sqliteTable("totals", {
  id: integer("id").primaryKey(),
  count: integer("count").notNull(),
  payload: text("payload").notNull(),
});
export const storeVersion = sqliteTable("store_version", {
  version: integer("version").primaryKey(),
});
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "sqlite", schema: "./schema.ts" });
// generate-schema.ts
import { writeFileSync } from "node:fs";
import { exportSql } from "drizzle-kit/cli";
const result = await exportSql({ dialect: "sqlite", schema: "./schema.ts" });
if (result.status !== "ok") throw new Error(JSON.stringify(result));
writeFileSync(
  "schema.gen.ts",
  `export const statements = ${JSON.stringify(result.statements, null, 2)};\n`,
);
writeFileSync("schema.sql", result.statements.join("\n--> statement-breakpoint\n"));
```

```ts
// consumer.ts; consumer-bun.ts differs only in the Drizzle driver import.
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SqlClient from "effect/sql/SqlClient";
import * as Drizzle from "drizzle-orm/effect-sqlite-node";
import { eq, sql } from "drizzle-orm";
import { totals, storeVersion } from "./schema.ts";

export const exercise = (statements: readonly string[]) =>
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;
    const db = yield* Drizzle.makeWithDefaults();
    for (const statement of statements) yield* client.unsafe(statement);
    yield* db.insert(storeVersion).values({ version: 1 });
    yield* db.insert(totals).values({ id: 1, count: 2, payload: '{"tokens":42}' });
    yield* db
      .insert(totals)
      .values({ id: 1, count: 3, payload: '{"tokens":42}' })
      .onConflictDoUpdate({ target: totals.id, set: { count: 3 } });
    yield* db.transaction((tx) => tx.insert(totals).values({ id: 2, count: 4, payload: "{}" }));
    yield* db.delete(totals).where(eq(totals.id, 2));
    const rows = yield* db
      .select({
        count: totals.count,
        tokens: sql<number>`json_extract(${totals.payload}, '$.tokens')`,
      })
      .from(totals);
    const raw = yield* client<{
      tokens: number;
    }>`SELECT json_extract(payload, '$.tokens') AS tokens FROM totals`;
    const rollback = yield* Effect.exit(
      db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.insert(totals).values({ id: 99, count: 99, payload: "{}" });
          return yield* tx.rollback();
        }),
      ),
    );
    const afterRollback = yield* db.select().from(totals);
    return { rows, raw, rollback: Exit.isFailure(rollback), afterRollback };
  });
export const readonlyExercise = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;
  const db = yield* Drizzle.makeWithDefaults();
  const rows = yield* db.select().from(totals);
  const write = yield* Effect.exit(db.insert(totals).values({ id: 8, count: 8, payload: "{}" }));
  const transaction = yield* client.withTransaction(db.select().from(totals));
  return { rows, write: Exit.isFailure(write), transaction };
});
```

Direct runner: import `statements` from `schema.gen.ts`, `exercise`/`readonlyExercise`, `Effect`, `assert` from `node:assert/strict`, and `copyFileSync` from `node:fs`. Provide `@effect/sql-sqlite-node/SqliteClient.layer({ filename, disableWAL: true })` to `exercise(statements)` and call `Effect.runPromise`. Assert the exact selected row, raw token value 42, rollback true and one remaining row. Copy the closed file to `${filename}.source`, run `readonlyExercise` with the read-only layer, and assert write true and one row in each read. Bun substitutes the Bun client and consumer imports. Use a **fresh filename on every run**.

Worker reproduction: the worker imports the Bun consumer/client, runs the same two scoped programs and file copy, then `postMessage({ result, ro })`. The parent creates `new Worker(new URL("./worker.ts", import.meta.url).href)`, awaits `onmessage` (rejects `onerror`), checks tokens 42 and write true, then terminates it. No connection, Effect runtime object or Drizzle query builder is sent between threads.

## 4. Full schema creation, not migrations

`bun drizzle-kit export --config drizzle.config.ts > schema.sql` produced clean DDL for both tables with no snapshots, migration journal or database. **Its plain SQL output has no statement breakpoints.** The SQLite client prepares statements individually: retain boundaries instead of splitting arbitrary SQL on semicolons (SQL expressions can contain them).

The SDK script above was executed with Node 24 and the matching rc5 Kit+ORM packages. It preserves the individual `statements` in generated TS and also emits one SQL file with explicit breakpoints. Runtime needs only those generated statements and the SQL client, not Kit. A full empty-baseline `generate` is another supported route, but creates migration artifacts that the rebuild-only stats store does not need. A check that regeneration produces identical output can prevent schema/DDL drift; no such check was landed here. [export] [sdk]

**Documentation/package mismatch:** the pinned GitHub `SDK.md` describes root-level exports, but published rc5 `import('drizzle-kit')` exposed only `defineConfig`. The working published SDK subpath is **`drizzle-kit/cli`**, exposing `check`, `exportSql`, `generate`, `pull`, `push`, `up`. Mixing the earlier OpenCode Kit pin with the newer rc5 ORM made Node SDK import fail on a missing `CockroachArray` export, even though Bun's CLI export worked. The final SDK proof uses matching rc5 versions; avoid inferring arbitrary Kit/ORM compatibility from a CLI success.

OpenCode's generator is **`packages/core/script/migration.ts`**, invoked by `bun run migration` in core. It generates incremental migrations against `schema.json` separately; then runs `drizzle-kit generate` against an **empty temporary output directory** to obtain the full schema. It reads the single generated `migration.sql`, splits `--> statement-breakpoint`, and renders `schema.gen.ts` as `Effect.gen` with `yield* tx.run(...)` for each statement. Its `--check` regenerates and compares the full schema and migration registry. Thus `schema.gen.ts` is generated from the Drizzle schema, not handwritten or extracted from the live database. [opencode-generator]

## 5. Gates and dependency versus vendored source

The spike copied the repo's `.oxlintrc.json` unchanged, installed its complexity plugin, and used strict TS options including bundler module resolution, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, isolated modules and explicit `.ts` imports. The small consumer modules, schema, test and type proof produced **zero diagnostics** under type-aware oxlint before and after the declaration fix. No `any`, declared `unknown`, casts, inline suppressions or config relaxations were required in the consumer. Types internal to dependencies are not a reason to declare `any` in application code. [repo-gates]

Vitest ran one real Node SQLite test of both consumer programs with V8 coverage restricted to `consumer.ts` and `schema.ts`, enforcing `{ perFile:true, statements:100, branches:100, functions:100, lines:100 }`. Result: both files fully covered, **29/29 statements, 6/6 functions, 25/25 lines**, with zero instrumented branches. A loop over two generated statements was exercised; the failure exits/rollback were also executed. Bun got separate real-runtime assertions rather than simulated Node coverage.

Vendored-source measurements at the OpenCode pin:

| Measurement                                   | Result                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.ts` files / total source lines              | 15 / 2,735, counting blank/comment lines                                                                  |
| README lines / subtree lines including README | 35 / 2,770                                                                                                |
| Explicit `any`                                | 105; confirmed by oxlint, not just a text search                                                          |
| Files violating `<500`                        | 0; largest 421 lines                                                                                      |
| Blanket `/* oxlint-disable */`                | Present in implementation files                                                                           |
| Additional audit findings                     | 142 restricted-type (`unknown`) diagnostics; unsafe assignment/argument/call/return and other diagnostics |

Method: copy the fork to scratch, remove its blanket disable headers **only in the audit copy**, then run `oxlint --type-aware --format json fork-audit`. The JSON diagnostics contained 105 `typescript(no-explicit-any)` violations. Existing headers must not be used to evade opencode-stats' exception process. Coverage and mutation testing of the whole fork, duplication, dead-code and complexity feasibility were **not established**. The small consumer's coverage cannot establish the vendored fork's coverage.

**Dependency availability:** the npm tarball for `@opencode/core@2.0.22` contains `dist/database/drizzle/index.js`, driver/session/builders, and matching declarations. Its wildcard export maps `@opencode/core/database/drizzle` to those files. It depends exactly on `effect@4.0.0-rc.112` and OpenCode's ORM pin. It is a published dependency, but not a standalone stable-compatible adapter: using its factory returns RC Effects and imports RC SQL paths. Installing it does not turn those Effects into stable Effects. Registry lookups for `@opencode-ai/effect-drizzle-sqlite` and `@opencode/effect-drizzle-sqlite` returned 404. No standalone OpenCode stable adapter package was established. [core-npm]

**Licences:** Drizzle ORM's pinned manifest and source licence are **Apache-2.0**; OpenCode core and root licence are **MIT**. Vendoring upstream-derived fork code requires preserving the applicable upstream licence/notices and marking modifications, in addition to OpenCode's MIT notice. OpenCode's README explicitly says the exact copied upstream revision is **unknown**; its current Drizzle compatibility pin is not provenance. Do not assume the whole derived subtree can be relabelled MIT merely because the enclosing project is MIT. This is a source/licence observation, not legal advice. [licences] [opencode-fork]

## 6. Bun-specific boundaries

- The stable Bun adapter uses synchronous `bun:sqlite`, a serialized connection, and synchronous busy waits. It does not move database work off the thread running the Effect. Default busy timeout is five seconds; streaming query execution and `updateValues` are unsupported. The Node 4.0.0 adapter uses built-in `node:sqlite`, **not better-sqlite3**. [adapters]
- Bun Worker execution was **proved** with a connection owned inside the worker, including writes, transactions, JSON and read-only reads/rejection. Bun documents Workers as separate JS instances/threads and still calls the API experimental, particularly termination. This smoke test does not prove cancellation of a blocked SQLite call, shutdown during a transaction, shared connection safety or production throughput. [workers]
- No current failure specific to the requested native Drizzle rc5 driver on Bun 1.4.2 was found in this spike. The known old [Effect issue #3610](https://github.com/Effect-TS/effect/issues/3610) reports Effect **3.7.0** / `@effect/sql-drizzle` returning null for write results, not this native Drizzle integration. Stable Bun's adapter normalizes results with `?? []`. [Effect issue #6067](https://github.com/Effect-TS/effect/issues/6067) likewise concerns the older `@effect/sql-drizzle` `$count` patch, not the tested rc5 driver. Do not generalize those reports across different integrations.
- [OpenCode issue #34648](https://github.com/anomalyco/opencode/issues/34648) was closed rather than replacing its fork: its contemporaneous blocker was the old Node adapter's `better-sqlite3` packaging risk. That statement is historical, not evidence that stable `@effect/sql-sqlite-node@4.0.0` requires better-sqlite3.
- Use `disableWAL:true` explicitly for the OpenCode database read-only connection. Stable Node still attempts its WAL pragma by default; Bun skips it when read-only. This research uses only synthetic fixtures; the earlier Effect-module research independently proved the Node read-only default failure on a DELETE-journal file. [adapters]

## Limitations

No production schema, sync loop, rebuild atomicity, joins/relations, large-data benchmark, foreign-key enforcement policy, safe-integer policy, nested-savepoint semantics, cache invalidation, query cancellation or migration APIs were validated. No Linux/Windows runs or compiled OpenCode/plugin loading were attempted. No Stryker, knip or jscpd pass is claimed. The prerelease dist-tags and publication status are a point-in-time observation. The stable path patch covers the ESM SQLite API exercised here, not every Drizzle dialect/export.

## Primary-source index

- [registry]: [ORM registry](https://registry.npmjs.org/drizzle-orm), [Kit registry](https://registry.npmjs.org/drizzle-kit); owning manifests and UTC `time` map. Exact final manifests: [ORM rc5](https://registry.npmjs.org/drizzle-orm/1.0.0-rc.5-5935859), [Kit rc5](https://registry.npmjs.org/drizzle-kit/1.0.0-rc.5-5935859), [OpenCode ORM pin](https://registry.npmjs.org/drizzle-orm/1.0.0-rc.5-169397b), [OpenCode Kit pin](https://registry.npmjs.org/drizzle-kit/1.0.0-rc.5-ab785fc). Tarballs were downloaded from each manifest's `dist.tarball` and inspected locally.
- [early]: [beta.1 manifest](https://registry.npmjs.org/drizzle-orm/1.0.0-beta.1-cdf226f), [driver source at cdf226f](https://github.com/drizzle-team/drizzle-orm/blob/cdf226f789c98e56b91f65b2476f40fd96715714/drizzle-orm/src/effect/sqlite/driver.ts); tarball `effect/sqlite/driver.js` and session declarations.
- [effect3]: [effect3 manifest](https://registry.npmjs.org/drizzle-orm/1.0.0-beta.9-635dfc2), [effect-fixes manifest](https://registry.npmjs.org/drizzle-orm/1.0.0-beta.10-9f1399e); these and the other named Effect-tag tarballs were inspected for files and imports.
- [drivers]: [Bun driver](https://github.com/drizzle-team/drizzle-orm/blob/59358596b5be6a79f9cc1a2a20d39d276f6ab4b5/drizzle-orm/src/effect-sqlite-bun/driver.ts), [Node session](https://github.com/drizzle-team/drizzle-orm/blob/59358596b5be6a79f9cc1a2a20d39d276f6ab4b5/drizzle-orm/src/effect-sqlite-node/session.ts); matching npm tarball `effect-sqlite-{bun,node}/{driver,session}.js`. [rc.4 release](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.4) introduces the adapter families.
- [types]: final [ORM tarball](https://registry.npmjs.org/drizzle-orm/-/drizzle-orm-1.0.0-rc.5-5935859.tgz), `effect-sqlite-node/session.d.ts:13`, `effect-sqlite-bun/session.d.ts:13`, `sqlite-core/effect/db.d.ts:25`, `sqlite-core/effect/session.d.ts:13`; source [SQLite db](https://github.com/drizzle-team/drizzle-orm/blob/59358596b5be6a79f9cc1a2a20d39d276f6ab4b5/drizzle-orm/src/sqlite-core/effect/db.ts).
- [stable]: [effect@4.0.0 manifest](https://registry.npmjs.org/effect/4.0.0), published `src/sql/SqlClient.ts`; [source at stable research pin](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/effect/src/sql/SqlClient.ts). Stable package exports were also checked directly in the installed distribution.
- [adapters]: [Bun 4.0.0](https://registry.npmjs.org/@effect/sql-sqlite-bun/4.0.0), [Node 4.0.0](https://registry.npmjs.org/@effect/sql-sqlite-node/4.0.0), their tarballs' `src/SqliteClient.ts`; [Bun source](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/sql/sqlite-bun/src/SqliteClient.ts), [Node source](https://github.com/Effect-TS/effect/blob/67ba4e46a11ccda0b6761578bfd22c04ae00167d/packages/sql/sqlite-node/src/SqliteClient.ts).
- [export]: [official export documentation](https://orm.drizzle.team/docs/drizzle-kit-export), full-schema generation semantics; verified with the exact installed CLI.
- [sdk]: pinned [SDK.md](https://github.com/drizzle-team/drizzle-orm/blob/59358596b5be6a79f9cc1a2a20d39d276f6ab4b5/drizzle-kit/SDK.md), subject to the root-versus-CLI mismatch above; [published Kit tarball](https://registry.npmjs.org/drizzle-kit/-/drizzle-kit-1.0.0-rc.5-5935859.tgz), `package.json`, `index.mjs`, `cli.mjs`, actual export lists and executed `exportSql` proof.
- [opencode-fork]: [README](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/src/database/drizzle/README.md), [generic driver](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/src/database/drizzle/effect-sqlite/driver.ts), [fork inventory](https://github.com/anomalyco/opencode/tree/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/src/database/drizzle).
- [opencode-generator]: [migration.ts](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/script/migration.ts#L29-L60), full generation; lines 93–109 invoke Kit, 148–180 render schema/statements. [core package scripts](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/package.json).
- [core-npm]: [@opencode/core@2.0.22 manifest](https://registry.npmjs.org/@opencode/core/2.0.22), [tarball](https://registry.npmjs.org/@opencode/core/-/core-2.0.22.tgz); published files/export map and exact Effect dependency verified rather than inferred from the checkout.
- [repo-gates]: [AGENTS.md at base](https://github.com/ysm-dev/opencode-stats/blob/68735ee/AGENTS.md), [.oxlintrc.json](https://github.com/ysm-dev/opencode-stats/blob/68735ee/.oxlintrc.json), [tsconfig.base.json](https://github.com/ysm-dev/opencode-stats/blob/68735ee/tsconfig.base.json), [package.json](https://github.com/ysm-dev/opencode-stats/blob/68735ee/package.json).
- [licences]: [Drizzle Apache-2.0](https://github.com/drizzle-team/drizzle-orm/blob/59358596b5be6a79f9cc1a2a20d39d276f6ab4b5/LICENSE), [OpenCode MIT](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/LICENSE).
- [workers]: [Bun's official Worker documentation](https://bun.com/docs/runtime/workers), inspected at research time; independent real Bun 1.4.2 worker proof above.
