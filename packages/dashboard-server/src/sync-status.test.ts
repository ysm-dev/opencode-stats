import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { expect, it, vi } from "vitest";
import { syntheticFixture, syntheticV1Database } from "@opencode-stats/stats-store/testing";
import { nodeRuntime } from "@opencode-stats/stats-store/node";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { decode } from "@opencode-stats/browser-copy";
import { program } from "./main.ts";
import { nodeServer } from "./http.node.ts";
import { nodeLock } from "./lock.node.ts";
import { readySignal } from "./testing/program.ts";
import { liveEvents } from "./testing/live-events.ts";

it("a first-run newer schema recovers its initial copy, feed and revision-zero changes automatically", async () => {
  const f = syntheticFixture();
  f.writer.session("first-run");
  f.writer.message({
    id: "first-step",
    session: "first-run",
    seq: 0,
    start: 1,
    tokens: { input: 987 },
  });
  const migration = "20261007120000_first_run_future";
  f.writer.migration(migration);
  const port = await temporaryPort();
  const origin = `http://127.0.0.1:${port}`;
  const signal = readySignal();
  const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const fiber = Effect.runFork(
    program(["--db", f.source, "--port", String(port)], nodeServer, nodeRuntime, nodeLock, {
      XDG_STATE_HOME: f.folder,
      XDG_CACHE_HOME: f.folder,
    }),
  );
  let stream: Awaited<ReturnType<typeof liveEvents>> | undefined;
  try {
    await signal.ready;
    stream = await liveEvents(origin);
    const stopped = await stream.read();
    expect(stopped.stop?.reason).toBe("schema.newer");
    const initial = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
    expect(initial.revision).toBe(0);
    expect(initial.historyComplete).toBe(false);
    expect(initial.ids).toEqual([]);
    f.writer.migration(migration, false);
    const recovered = await Effect.runPromise(
      Effect.promise(() => stream!.read()).pipe(Effect.timeout("3 seconds")),
    );
    expect(recovered.stop).toBeNull();
    const changes = decode(
      await (
        await fetch(
          `${origin}/api/browser-copy/changes?generation=${initial.generation}&revision=0`,
        )
      ).arrayBuffer(),
    );
    expect(changes.generation).toBe(recovered.generation);
    expect(changes.revision).toBe(recovered.revision);
    expect(changes.historyComplete).toBe(true);
    expect(changes.ids).toEqual(["first-step"]);
    expect([...changes.steps.input]).toEqual([987]);
    expect(decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer()).steps).toEqual(
      changes.steps,
    );
  } finally {
    await stream?.close();
    await Effect.runPromise(Fiber.interrupt(fiber));
    signal.output.mockRestore();
    errors.mockRestore();
    f.dispose();
  }
});

it.each([
  { mode: "plain", source: "(OpenCode's data folder)", origin: "default", publicSource: "" },
  { mode: "yellow", source: "(`OPENCODE_DB`)", origin: "environment" },
  { mode: "no-color", source: "(from `--db`)", origin: "flag" },
  { mode: "plugin", source: "(the plugin's `db` option)", origin: "plugin" },
  { mode: "plugin", source: "(`OPENCODE_DB` in OpenCode's service config)", origin: "service" },
])(
  "keeps HTTP and SSE alive while sync stops ($mode, $origin), then clears the reason with the recovered facts",
  async ({ mode, source, origin: provenance, publicSource }) => {
    const f = syntheticFixture();
    f.writer.session("root", null, { title: "SYNTHETIC PRIVATE TITLE" });
    const message = { id: "one", session: "root", seq: 0, start: 1 };
    f.writer.message({ ...message, tokens: { input: 7 } });
    const port = await temporaryPort();
    const origin = `http://127.0.0.1:${port}`;
    const signal = readySignal();
    const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const fiber = Effect.runFork(
      program(
        [
          "--db",
          f.source,
          "--port",
          String(port),
          "--starter",
          mode === "plugin" ? "plugin" : "terminal",
          "--db-source",
          source,
        ],
        nodeServer,
        nodeRuntime,
        nodeLock,
        {
          XDG_STATE_HOME: f.folder,
          XDG_CACHE_HOME: f.folder,
          ...(mode === "yellow" || mode === "no-color" ? { OPENCODE_STATS_COLOR: "1" } : {}),
          ...(mode === "no-color" ? { NO_COLOR: "" } : {}),
        },
      ),
    );
    let stream: Awaited<ReturnType<typeof liveEvents>> | undefined;
    try {
      await signal.ready;
      const before = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
      stream = await liveEvents(origin);
      expect((await stream.read()).stop).toBeNull();
      f.writer.migration("20261007120000_future");
      const stopped = await stream.read();
      expect(stopped.stop).toMatchObject({
        reason: "schema.newer",
        params: {
          mode: mode === "plugin" ? "plugin" : "terminal",
          source: publicSource ?? source,
        },
      });
      f.writer.message({ ...message, tokens: { input: 9 } });
      expect(decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer())).toEqual(
        before,
      );
      const heldChanges = decode(
        await (
          await fetch(
            `${origin}/api/browser-copy/changes?generation=${before.generation}&revision=${before.revision}`,
          )
        ).arrayBuffer(),
      );
      expect(heldChanges).toEqual(before);
      f.writer.migration("20261007120000_future", false);
      const recovered = await stream.read();
      expect(recovered.stop).toBeNull();
      expect(recovered.generation).toBe(before.generation);
      expect(recovered.revision).toBeGreaterThan(before.revision);
      const after = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
      expect([...after.steps.input]).toEqual([9]);
      const stderr = errors.mock.calls.map(([line]) => String(line)).join("");
      expect(stderr === "").toBe(mode === "plugin");
      expect(stderr.match(/Not updating:/gu) ?? []).toHaveLength(mode === "plugin" ? 0 : 1);
      expect(stderr.match(/Up to date again\./gu) ?? []).toHaveLength(mode === "plugin" ? 0 : 1);
      expect(stderr.includes("run bunx opencode-stats@latest")).toBe(mode !== "plugin");
      expect(stderr.includes("\u001b[33m")).toBe(mode === "yellow");
      const log = readFileSync(join(f.folder, "opencode-stats/server.log"), "utf8");
      expect(log).toContain(`source="${provenance}"`);
      for (const event of ["schema.checked", "sync.stopped", "sync.resumed"])
        expect(log).toContain(`event=${event}`);
      for (const privateText of ["SYNTHETIC PRIVATE", "SELECT ", "params:", "time.created"])
        expect(log).not.toContain(privateText);
    } finally {
      await stream?.close();
      await Effect.runPromise(Fiber.interrupt(fiber));
      signal.output.mockRestore();
      errors.mockRestore();
      f.dispose();
    }
  },
);

it.each(["plugin", "terminal"])(
  "serves a typed first-run v1 problem (%s) without reading or upgrading it",
  async (mode) => {
    const f = syntheticFixture();
    const source = join(f.folder, "v1.db");
    syntheticV1Database(source);
    const before = readFileSync(source);
    const port = await temporaryPort();
    const signal = readySignal();
    const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const fiber = Effect.runFork(
      program(
        ["--db", source, "--port", String(port), "--starter", mode],
        nodeServer,
        nodeRuntime,
        nodeLock,
        { XDG_STATE_HOME: f.folder, XDG_CACHE_HOME: f.folder },
      ),
    );
    let stream: Awaited<ReturnType<typeof liveEvents>> | undefined;
    try {
      await signal.ready;
      stream = await liveEvents(`http://127.0.0.1:${port}`);
      expect((await stream.read()).stop?.reason).toBe(
        mode === "terminal" ? "schema.v1" : "schema.other",
      );
      expect(readFileSync(source).equals(before)).toBe(true);
    } finally {
      await stream?.close();
      await Effect.runPromise(Fiber.interrupt(fiber));
      signal.output.mockRestore();
      errors.mockRestore();
      f.dispose();
    }
  },
);
