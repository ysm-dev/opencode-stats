import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Deferred from "effect/Deferred";
import * as TestClock from "effect/testing/TestClock";
import * as Schema from "effect/Schema";
import { expect, it, onTestFinished, vi } from "vitest";
import { answering, readRecord } from "@opencode-stats/launcher";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { syntheticFixture } from "@opencode-stats/stats-store/testing";
import { nodeRuntime } from "@opencode-stats/stats-store/node";
import { program } from "./main.ts";
import { nodeServer } from "./http.node.ts";
import { nodeLock } from "./lock.node.ts";
import { readySignal } from "./testing/program.ts";

it.each(["plugin", "terminal"] as const)(
  "%s lifetime follows actual HTTP holds, not a detached timer",
  async (starter) => {
    const fixture = syntheticFixture();
    fixture.writer.session("ses-clock");
    fixture.writer.message({
      id: "msg-clock",
      session: "ses-clock",
      seq: 0,
      start: 1000,
      tokens: { input: 1 },
    });
    const port = await temporaryPort();
    const folder = join(fixture.folder, "opencode-stats");
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { ready: built, output } = readySignal();
    const controller = new AbortController();
    onTestFinished(() => controller.abort());
    let releaseWork!: () => void;
    const work = new Promise<void>((done) => {
      releaseWork = done;
    });
    const sleeping = Deferred.makeUnsafe<void>();
    const runtime = {
      ...nodeRuntime,
      worker: (...args: Parameters<typeof nodeRuntime.worker>) =>
        Effect.promise(() => work).pipe(
          Effect.andThen(nodeRuntime.worker(...args)),
          Effect.andThen(Deferred.succeed(sleeping, undefined)),
          Effect.andThen(Effect.sleep("37 millis")),
        ),
    };
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* TestClock.setTime(1000);
            const fiber = yield* program(
              ["--db", fixture.source, "--port", String(port), "--starter", starter],
              nodeServer,
              runtime,
              nodeLock,
              { XDG_STATE_HOME: fixture.folder, XDG_CACHE_HOME: fixture.folder },
            ).pipe(Effect.forkScoped);
            yield* Effect.promise(async () => {
              await vi.waitFor(async () => expect(await answering(folder)).toBeDefined());
            });
            releaseWork();
            // HTTP identity precedes asynchronous SQLite work. Advance only after that work
            // reaches the virtual-clock boundary, not when server.json happens to appear.
            yield* Deferred.await(sleeping);
            yield* TestClock.adjust("37 millis");
            yield* Effect.promise(() => built);
            const record = readRecord(folder)!;
            const headers = {
              Authorization: `Bearer ${record.secret}`,
              Origin: record.address,
              "X-Opencode-Stats-Protocol": "1",
              Connection: "close",
            };
            const status = async () => {
              const response = await fetch(`${record.address}/api/server`, { headers });
              const body = Schema.decodeUnknownSync(
                Schema.Struct({
                  holders: Schema.Number,
                  idleDeadline: Schema.NullOr(Schema.Number),
                }),
              )(await response.json());
              return body;
            };
            yield* Effect.sync(() => {
              const text = readFileSync(join(folder, "server.log"), "utf8");
              expect(text).toContain(
                'event=build.start reason="first" sessions=0 steps=0 milliseconds=0',
              );
              expect(text).toContain(
                'event=build.end reason="first" sessions=1 steps=1 milliseconds=0',
              );
              expect(vi.getTimerCount()).toBe(1);
            });
            const readers = yield* Effect.promise(async () => {
              const a = (await fetch(`${record.address}/api/hold`, { headers })).body!.getReader();
              const b = (await fetch(`${record.address}/api/hold`, { headers })).body!.getReader();
              await a.read();
              await b.read();
              expect(await status()).toEqual({ holders: 2, idleDeadline: null });
              return [a, b];
            });
            yield* TestClock.adjust("20 seconds");
            yield* Effect.promise(async () => {
              expect(await status()).toEqual({ holders: 2, idleDeadline: null });
              await readers[0]!.cancel();
              await vi.waitFor(async () =>
                expect(await status()).toEqual({ holders: 1, idleDeadline: null }),
              );
            });
            yield* TestClock.adjust("20 seconds");
            yield* Effect.promise(async () => {
              expect(await status()).toEqual({ holders: 1, idleDeadline: null });
              await readers[1]!.cancel();
              await vi.waitFor(async () => expect(await status()).toMatchObject({ holders: 0 }));
            });
            yield* TestClock.adjust("9 seconds");
            yield* Effect.promise(async () => {
              expect(await status()).toEqual({
                holders: 0,
                idleDeadline: starter === "plugin" ? 51037 : null,
              });
            });
            if (starter === "terminal") {
              yield* TestClock.adjust("20 seconds");
              yield* Effect.promise(async () => {
                const response = await fetch(`${record.address}/api/stop`, {
                  method: "POST",
                  headers,
                });
                expect(response.status).toBe(204);
              });
            } else yield* TestClock.adjust("1 second");
            yield* TestClock.adjust("100 millis");
            yield* Fiber.join(fiber);
            yield* Effect.promise(async () => {
              await expect(fetch(record.address)).rejects.toThrow("fetch failed");
            });
          }).pipe(Effect.provide(TestClock.layer())),
        ),
        { signal: controller.signal },
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      output.mockRestore();
      vi.useRealTimers();
      fixture.dispose();
    }
  },
);
