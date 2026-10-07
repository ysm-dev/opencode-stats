import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Stream from "effect/Stream";
import * as Deferred from "effect/Deferred";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stateFolder, publishRecord, displayPath } from "@opencode-stats/launcher";
import { LockHeld, type ServerLock } from "./lock.ts";
import { lifecycle } from "./lifecycle.ts";
import { serverLog } from "./log.ts";
import { serverFailure, ServerProblem } from "./errors.ts";
import { version } from "./paths.ts";
import { BindProblem } from "./bind.ts";
import type { bunServer } from "./http.bun.ts";
import { parseArguments } from "./arguments.ts";
import { startServer } from "./server.ts";
import { encodeStore } from "./copy.ts";
import { stayInSync, type StoreCopy, type StoreRuntime } from "@opencode-stats/stats-store";
import { SqlFailure } from "@opencode-stats/stats-store";
import { createLiveFeed, type CopyCursor } from "@opencode-stats/browser-copy/api";
import { syncReport } from "./sync-report.ts";

export const program = (
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: process arguments pass immediately to the argument parser
  args: unknown,
  adapter: typeof bunServer,
  runtime: StoreRuntime,
  takeLock: ServerLock,
  env: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const options = yield* Effect.try({
      try: () => parseArguments(args),
      catch: () =>
        new ServerProblem(
          "Can't start: invalid dashboard server arguments. Use --db <path> --port <n>.",
        ),
    });
    const database = yield* Effect.try({
      try: () => {
        if (!statSync(options.db).isFile()) throw new Error();
        return realpathSync(options.db);
      },
      catch: () => new ServerProblem("OpenCode database must be an existing file."),
    });
    const folder = stateFolder(env);
    yield* Effect.sync(() => {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      chmodSync(folder, 0o700);
    });
    yield* takeLock(join(folder, "server.lock"));
    const log = yield* Effect.acquireRelease(
      Effect.sync(() => serverLog(folder)),
      (value) => Effect.sync(() => value.close()),
    );
    const lifetime = {
      version,
      platform: process.platform,
      runtime: process.versions["bun"] ?? process.versions.node,
      starter: options.starter,
      port: options.port,
    };
    yield* Effect.gen(function* () {
      let copy: StoreCopy | undefined;
      let stopped = false;
      let waitingCopy: StoreCopy | undefined;
      let bytes: Uint8Array = new Uint8Array();
      const initial = yield* Deferred.make<void>();
      const ready =
        yield* Deferred.make<(cursor: CopyCursor) => Effect.Effect<StoreCopy, SqlFailure>>();
      const feed = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createLiveFeed(
            () => ({ generation: copy!.generation, revision: copy!.revision }),
            version,
          ),
        ),
        (value) => Effect.promise(value.close),
      );
      const publish = (value: StoreCopy) => {
        copy = value;
        bytes = encodeStore(value);
        feed.announce(value);
        Deferred.doneUnsafe(initial, Effect.void);
      };
      const record = {
        address: `http://127.0.0.1:${options.port}`,
        pid: process.pid,
        version,
        database,
        starter: options.starter,
        protocol: 1,
        secret: randomBytes(32).toString("hex"),
      } as const;
      const control = yield* lifecycle(
        record,
        Effect.sync(() => log.write({ event: "conflict", kind: "database" })),
      );
      yield* startServer(
        undefined,
        {
          whole: () => Deferred.await(initial).pipe(Effect.map(() => bytes)),
          changes: (cursor) =>
            Deferred.await(ready).pipe(
              Effect.flatMap((read) => (stopped && copy ? Effect.succeed(copy) : read(cursor))),
              Effect.map(encodeStore),
            ),
          live: Stream.unwrap(Deferred.await(initial).pipe(Effect.map(() => feed.stream))),
        },
        control,
      );
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          publishRecord(folder, record);
          log.write({ event: "start", ...lifetime });
          const selected = options.databaseSource;
          log.write({
            event: "database",
            database: options.db,
            source:
              selected === "(OpenCode's data folder)"
                ? "default"
                : selected?.includes("service config")
                  ? "service"
                  : selected?.includes("OPENCODE_DB")
                    ? "environment"
                    : selected?.includes("plugin")
                      ? "plugin"
                      : "flag",
          });
        }),
        () =>
          Effect.sync(() => {
            rmSync(join(folder, "server.json"), { force: true });
            log.write({ event: "stop", ...lifetime });
          }),
      );
      yield* Effect.sync(() => process.stdout.write("opencode-stats-ready\n"));
      const store = yield* stayInSync(
        {
          source: options.db,
          resolvedSource: database,
          ...(env["XDG_CACHE_HOME"] ? { cacheHome: env["XDG_CACHE_HOME"] } : {}),
        },
        runtime,
        (value) => {
          if (stopped && copy) waitingCopy = value;
          else publish(value);
        },
        syncReport({
          params: {
            release: version,
            mode: options.starter,
            database: displayPath(database),
            source:
              options.databaseSource === "(OpenCode's data folder)"
                ? ""
                : (options.databaseSource ?? "(from `--db`)"),
            cache: displayPath(
              join(env["XDG_CACHE_HOME"] || join(homedir(), ".cache"), "opencode-stats"),
            ),
          },
          log: log.write,
          status: (value) => {
            stopped = value !== null;
            if (!stopped && waitingCopy) {
              publish(waitingCopy);
              waitingCopy = undefined;
            }
            feed.status(value);
          },
          output: (line) => {
            process.stdout.write(line);
          },
          error: (line) => {
            process.stderr.write(line);
          },
          color:
            env["NO_COLOR"] === undefined &&
            (process.stderr.isTTY || env["OPENCODE_STATS_COLOR"] === "1"),
          now: () => new Date(),
        }),
      );
      yield* Deferred.succeed(ready, store.read);
      yield* control.stopped;
      yield* Effect.sleep("100 millis");
    }).pipe(
      Effect.scoped,
      Effect.provide(adapter(options.port)),
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          if (Cause.hasInterrupts(cause)) return yield* Effect.failCause(cause);
          const error = Cause.squash(cause);
          if (error instanceof BindProblem && error.code === "EADDRINUSE")
            yield* Effect.sync(() => log.write({ event: "conflict", kind: "port" }));
          const failure = error instanceof SqlFailure ? error : serverFailure(error);
          yield* Effect.sync(() =>
            log.write({
              event: "crash",
              kind: failure.kind,
              code: failure.code,
              statement: failure.statement,
              frames: failure.frames,
            }),
          );
          return yield* Effect.fail(
            error instanceof BindProblem
              ? error
              : new ServerProblem(`Can't start: ${failure.kind}.`),
          );
        }),
      ),
    );
  }).pipe(
    Effect.scoped,
    Effect.catchIf(
      (error) => error instanceof LockHeld,
      () => Effect.void,
    ),
  );

export const processProgram = (...args: Parameters<typeof program>) =>
  program(...args).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        if (Cause.hasInterrupts(cause)) return;
        const error = Cause.squash(cause);
        process.stderr.write(
          `${error instanceof ServerProblem ? error.message : "Can't start: dashboard server unavailable."}\n`,
        );
        process.exitCode = 1;
      }),
    ),
  );
