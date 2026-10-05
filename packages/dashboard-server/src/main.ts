import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { stateFolder, publishRecord } from "@opencode-stats/launcher";
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
        accessSync(options.db, constants.R_OK);
        return realpathSync(options.db);
      },
      catch: () => new ServerProblem("OpenCode database must be an existing readable file."),
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
      let bytes: Uint8Array = new Uint8Array();
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
      yield* startServer(undefined, () => bytes, control);
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          publishRecord(folder, record);
          log.write({ event: "start", ...lifetime });
          log.write({ event: "database", database: options.db, source: "flag" });
        }),
        () =>
          Effect.sync(() => {
            rmSync(join(folder, "server.json"), { force: true });
            log.write({ event: "stop", ...lifetime });
          }),
      );
      const started = yield* Clock.currentTimeMillis;
      yield* Effect.sync(() => log.write({ event: "build.start", steps: 0, milliseconds: 0 }));
      yield* stayInSync(
        {
          source: options.db,
          ...(env["XDG_CACHE_HOME"] ? { cacheHome: env["XDG_CACHE_HOME"] } : {}),
        },
        runtime,
        (value) => {
          copy = value;
          bytes = encodeStore(value);
        },
      );
      const elapsed = (yield* Clock.currentTimeMillis) - started;
      yield* Effect.sync(() =>
        log.write({ event: "build.end", steps: copy!.steps.length, milliseconds: elapsed }),
      );
      yield* Effect.sync(() => process.stdout.write("opencode-stats-ready\n"));
      yield* control.stopped;
      yield* Effect.sleep("100 millis");
    }).pipe(
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
