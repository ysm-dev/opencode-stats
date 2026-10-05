import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Clock from "effect/Clock";
import * as Stream from "effect/Stream";
import * as Response from "effect/http/HttpServerResponse";
import type { ServerRecord } from "@opencode-stats/launcher";
import type { HttpServerRequest } from "effect/http/HttpServerRequest";

export const lifecycle = Effect.fnUntraced(function* (
  record: ServerRecord,
  conflict: Effect.Effect<void> = Effect.void,
) {
  const scope = yield* Effect.scope;
  const clock = yield* Clock.Clock;
  const stopped = yield* Deferred.make<void>();
  const stop = Deferred.succeed(stopped, undefined);
  let holders = 0;
  let idleDeadline: number | null = null;
  let timer: Fiber.Fiber<void> | undefined;
  const schedule = Effect.gen(function* () {
    if (record.starter === "plugin" && holders === 0) {
      idleDeadline = clock.currentTimeMillisUnsafe() + 10000;
      timer = yield* Effect.sleep("10 seconds").pipe(
        Effect.andThen(stop),
        Effect.asVoid,
        Effect.provideService(Clock.Clock, clock),
        Effect.forkIn(scope),
      );
    }
  });
  yield* schedule;
  const hold = Stream.unwrap(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.gen(function* () {
          holders += 1;
          idleDeadline = null;
          if (timer) yield* Fiber.interrupt(timer);
        }),
        () =>
          Effect.gen(function* () {
            holders -= 1;
            yield* schedule;
          }),
      );
      return Stream.make(new TextEncoder().encode("opencode-stats-hold/1\n")).pipe(
        Stream.concat(Stream.never),
      );
    }),
  );
  return {
    record,
    status: () => ({ ...record, holders, idleDeadline }),
    stopped: Deferred.await(stopped),
    stop,
    conflict,
    hold: Response.stream(hold),
  };
});

export type Lifecycle = Effect.Success<ReturnType<typeof lifecycle>>;

export const controlResponse = (control: Lifecycle, path: string, request: HttpServerRequest) =>
  Effect.gen(function* () {
    if (
      request.headers["authorization"] !== `Bearer ${control.record.secret}` ||
      request.headers["x-opencode-stats-protocol"] !== "1"
    )
      return Response.empty({ status: 403 });
    if (path === "/api/server" && request.method === "GET")
      return Response.jsonUnsafe(control.status());
    if (path === "/api/hold" && request.method === "GET") return control.hold;
    if (path === "/api/stop" && request.method === "POST") {
      yield* control.stop;
      return Response.empty();
    }
    if (path === "/api/conflict" && request.method === "POST") {
      yield* control.conflict;
      return Response.empty();
    }
    return Response.empty({ status: 405 });
  });
