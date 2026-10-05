import * as Effect from "effect/Effect";
import { expect, it, vi } from "vitest";
import { temporaryPort, serverRecord } from "@opencode-stats/launcher/testing";
import { nodeServer } from "./http.node.ts";
import { controlledServer } from "./testing/program.ts";
import * as TestClock from "effect/testing/TestClock";

it("authenticates the stable identity, hold and stop protocol without weakening origin rules", async () => {
  const port = await temporaryPort();
  const record = serverRecord(port, { starter: "terminal" });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { control, origin } = yield* controlledServer(record);
        yield* Effect.promise(async () => {
          for (const path of ["/api/server", "/api/hold", "/api/stop", "/api/conflict"]) {
            const response = await fetch(`${origin}${path}`, {
              method: path === "/api/stop" ? "POST" : "GET",
              headers: { Origin: origin },
            });
            expect(response.status).toBe(403);
            expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
            const wrongSecret = await fetch(`${origin}${path}`, {
              method: path === "/api/stop" ? "POST" : "GET",
              headers: {
                Origin: origin,
                Authorization: `Bearer ${"b".repeat(64)}`,
                "X-Opencode-Stats-Protocol": "1",
              },
            });
            expect(wrongSecret.status).toBe(403);
          }
          const headers = {
            Authorization: `Bearer ${record.secret}`,
            Origin: origin,
            "X-Opencode-Stats-Protocol": "1",
          };
          const answer = await fetch(`${origin}/api/server`, { headers });
          expect(await answer.json()).toEqual({ ...record, holders: 0, idleDeadline: null });
          const hold = await fetch(`${origin}/api/hold`, { headers });
          expect(hold.headers.get("content-type")).toBe("application/octet-stream");
          const reader = hold.body!.getReader();
          expect(new TextDecoder().decode((await reader.read()).value)).toBe(
            "opencode-stats-hold/1\n",
          );
          await reader.cancel();
          const foreign = await fetch(`${origin}/api/stop`, {
            method: "POST",
            headers: { ...headers, Origin: "https://foreign.test" },
          });
          expect(foreign.status).toBe(403);
          const stopped = await fetch(`${origin}/api/stop`, { method: "POST", headers });
          const conflict = await fetch(`${origin}/api/conflict`, { method: "POST", headers });
          expect(conflict.status).toBe(204);
          expect(stopped.status).toBe(204);
        });
        yield* control.stopped;
      }).pipe(Effect.provide(nodeServer(port))),
    ),
  );
});

it("a plugin holder cancels the initial idle deadline and wrong protocol or methods are refused", async () => {
  const port = await temporaryPort();
  const record = serverRecord(port);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { control, origin } = yield* controlledServer(record);
        const headers = {
          Authorization: `Bearer ${record.secret}`,
          Origin: origin,
          "X-Opencode-Stats-Protocol": "1",
        };
        const readers = yield* Effect.promise(async () => {
          for (const [path, method] of [
            ["server", "POST"],
            ["hold", "POST"],
            ["stop", "GET"],
            ["conflict", "GET"],
          ] as const) {
            const response = await fetch(`${origin}/api/${path}`, { method, headers });
            expect(response.status).toBe(405);
          }
          const wrong = await fetch(`${origin}/api/hold`, {
            headers: { ...headers, "X-Opencode-Stats-Protocol": "2" },
          });
          expect(wrong.status).toBe(403);
          const a = (await fetch(`${origin}/api/hold`, { headers })).body!.getReader();
          const b = (await fetch(`${origin}/api/hold`, { headers })).body!.getReader();
          await a.read();
          await b.read();
          return [a, b];
        });
        for (const reader of readers) {
          yield* TestClock.adjust("1 hour");
          yield* Effect.promise(async () => {
            const answer = await fetch(`${origin}/api/server`, { headers });
            expect(answer.status).toBe(200);
            await answer.text();
            await reader.cancel();
          });
        }
        yield* Effect.promise(async () => {
          await vi.waitFor(async () => {
            const status = await fetch(`${origin}/api/server`, { headers });
            expect(await status.json()).toMatchObject({ holders: 0 });
          });
        });
        yield* TestClock.adjust("10 seconds");
        yield* control.stopped;
      }).pipe(Effect.provide(nodeServer(port)), Effect.provide(TestClock.layer())),
    ),
  );
});
