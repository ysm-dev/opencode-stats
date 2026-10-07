import { join } from "node:path";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { expect, it, vi } from "vitest";
import { syntheticFixture, inThreadRuntime } from "@opencode-stats/stats-store/testing";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { decode } from "@opencode-stats/browser-copy";
import { program } from "./main.ts";
import { nodeServer } from "./http.node.ts";
import { nodeLock } from "./lock.node.ts";
import { readySignal } from "./testing/program.ts";
import { liveEvents } from "./testing/live-events.ts";

it("serves an unbuilt copy and typed can't-save state for a cold blocked cache, then recovers without restarting the dashboard server", async () => {
  const f = syntheticFixture();
  const cacheHome = join(f.folder, "cache-blocker");
  const stateHome = join(f.folder, "private-server-state");
  f.writer.session("owned-synthetic");
  f.writer.message({
    id: "owned-message",
    session: "owned-synthetic",
    seq: 0,
    start: 1,
    tokens: { input: 17 },
  });
  writeFileSync(cacheHome, "SYNTHETIC PRIVATE CONTENT");
  const port = await temporaryPort();
  const origin = `http://127.0.0.1:${port}`;
  const signal = readySignal();
  const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const server = Effect.runFork(
    program(["--db", f.source, "--port", String(port)], nodeServer, inThreadRuntime, nodeLock, {
      XDG_STATE_HOME: stateHome,
      XDG_CACHE_HOME: cacheHome,
    }),
  );
  let events: Awaited<ReturnType<typeof liveEvents>> | undefined;
  try {
    await signal.ready;
    const waiting = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
    expect(waiting).toMatchObject({ revision: 0, historyComplete: false, ids: [] });
    events = await liveEvents(origin);
    const stopped = await events.read();
    expect(stopped.stop).toMatchObject({
      reason: "store.unwritable",
      params: { cache: join(cacheHome, "opencode-stats"), code: "unavailable" },
    });
    const record = readFileSync(join(stateHome, "opencode-stats/server.json"), "utf8");
    rmSync(cacheHome);
    const resumed = await events.read();
    expect(resumed.stop).toBeNull();
    const current = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
    expect(current.historyComplete).toBe(true);
    expect([...current.steps.input]).toEqual([17]);
    expect(current.generation).not.toBe(waiting.generation);
    expect(readFileSync(join(stateHome, "opencode-stats/server.json"), "utf8")).toBe(record);
    const log = readFileSync(join(stateHome, "opencode-stats/server.log"), "utf8");
    expect(log).toContain("event=sync.stopped");
    expect(log).toContain("event=sync.resumed");
    expect(log).not.toContain("event=crash");
    expect(log).not.toContain("SYNTHETIC PRIVATE");
    expect(errors.mock.calls.map(([text]) => String(text)).join("")).toContain(
      "can't save statistics",
    );
  } finally {
    await events?.close();
    await Effect.runPromise(Fiber.interrupt(server));
    signal.output.mockRestore();
    errors.mockRestore();
    f.dispose();
  }
});
