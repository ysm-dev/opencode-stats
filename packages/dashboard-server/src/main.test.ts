import { temporaryPort } from "@opencode-stats/launcher/testing";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { describe, expect, it, vi } from "vitest";
import { nodeServer } from "./http.node.ts";
import { program } from "./main.ts";
import { syntheticFixture } from "@opencode-stats/stats-store/testing";
import { nodeRuntime } from "@opencode-stats/stats-store/node";
import { decode } from "@opencode-stats/browser-copy";
import { nodeLock } from "./lock.node.ts";

const readWhenReady = async (url: string): Promise<Response> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((done) => setTimeout(done, 10));
    }
  }
  throw new Error("Dashboard server did not start");
};

describe("dashboard server program", () => {
  it("serves release-owned assets at the requested port until interrupted", async () => {
    const port = await temporaryPort();
    const asset = `/assets/test-fixture-${randomUUID()}.js`;
    const file = resolve(`.release/package/dashboard${asset}`);
    await mkdir(resolve(".release/package/dashboard/assets"), { recursive: true });
    await writeFile(file, "synthetic-preview", { flag: "wx" });
    const fixture = syntheticFixture();
    fixture.writer.session("ses-http");
    fixture.writer.message({
      id: "msg-http",
      session: "ses-http",
      seq: 0,
      start: 1234,
      tokens: { input: 1, cache: { read: 2, write: 3 }, output: 4, reasoning: 5 },
      tools: [
        { id: "shell", name: "bash", status: "completed", ran: 1300, completed: 1500 },
        { id: "read", name: "read", status: "running" },
      ],
    });
    fixture.writer.message({
      id: "msg-unrecorded",
      session: "ses-http",
      seq: 1,
      start: 2345,
      tokens: { input: 0 },
    });
    const previous = process.env["XDG_CACHE_HOME"];
    process.env["XDG_CACHE_HOME"] = fixture.folder;
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const fiber = Effect.runFork(
      Effect.scoped(
        program(
          ["--port", String(port), "--db", fixture.source],
          nodeServer,
          nodeRuntime,
          nodeLock,
          { XDG_STATE_HOME: fixture.folder },
        ),
      ),
    );
    try {
      await vi.waitFor(() => expect(output).toHaveBeenCalledWith("opencode-stats-ready\n"));
      const response = await readWhenReady(`http://127.0.0.1:${port}${asset}`);
      expect(response.status).toBe(200);
      expect(output).toHaveBeenCalledWith("opencode-stats-ready\n");
      expect(await response.text()).toBe("synthetic-preview");
      const again = await fetch(`http://127.0.0.1:${port}${asset}`);
      expect(again.status).toBe(200);
      await again.text();
      const whole = await fetch(`http://127.0.0.1:${port}/api/browser-copy`);
      expect(whole.status).toBe(200);
      expect(whole.headers.get("content-type")).toBe("application/octet-stream");
      expect(whole.headers.get("content-encoding")).toBeNull();
      const copy = decode(await whole.arrayBuffer());
      expect(Array.from(copy.steps.start)).toEqual([1234, 2345]);
      expect(Array.from(copy.steps.input)).toEqual([1, 0]);
      expect(Array.from(copy.steps.cacheRead)).toEqual([2, NaN]);
      expect(Array.from(copy.steps.cacheWrite)).toEqual([3, NaN]);
      expect(Array.from(copy.steps.output)).toEqual([4, NaN]);
      expect(Array.from(copy.steps.reasoning)).toEqual([5, NaN]);
      expect(copy.toolIds).toEqual(["tool:msg-http:read", "tool:msg-http:shell"]);
      expect([...copy.tools.start]).toEqual([1234, 1234]);
      expect([...copy.tools.runStart]).toEqual([NaN, 1300]);
      expect([...copy.tools.completed]).toEqual([NaN, 1500]);
      expect([...copy.tools.outcome]).toEqual([NaN, 1]);
      const permanentId = (code: number) => copy.names.find((name) => name.code === code)!.id;
      expect(Array.from(copy.tools.tool, permanentId)).toEqual(["read", "shell"]);
      expect(Array.from(copy.tools.model, permanentId)).toEqual([
        "synthetic-provider/synthetic-model",
        "synthetic-provider/synthetic-model",
      ]);
      expect(Array.from(copy.steps.provider, permanentId)).toEqual([
        "synthetic-provider",
        "synthetic-provider",
      ]);
      expect(Array.from(copy.steps.model, permanentId)).toEqual([
        "synthetic-provider/synthetic-model",
        "synthetic-provider/synthetic-model",
      ]);
      expect(Array.from(copy.steps.variant, permanentId)).toEqual(["default", "default"]);
      expect(copy.sessions.code).toHaveLength(1);
      expect(copy.projects).toHaveLength(1);
      expect(copy.names.find((name) => name.dimension === "session")?.name).toBe("Untitled");
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber));
      await rm(file);
      fixture.dispose();
      if (previous === undefined) delete process.env["XDG_CACHE_HOME"];
      else process.env["XDG_CACHE_HOME"] = previous;
      output.mockRestore();
    }
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow("fetch failed");
  });
  it("rejects invalid flags before serving", async () => {
    await expect(
      Effect.runPromise(
        Effect.scoped(program(["--host", "0.0.0.0"], nodeServer, nodeRuntime, nodeLock)),
      ),
    ).rejects.toMatchObject({
      message: "Can't start: invalid dashboard server arguments. Use --db <path> --port <n>.",
    });
  });
  it("refuses a missing database without creating it or binding a port", async () => {
    const fixture = syntheticFixture();
    const adapter = vi.fn<typeof nodeServer>(nodeServer);
    try {
      await expect(
        Effect.runPromise(
          program(["--db", `${fixture.source}.missing`], adapter, nodeRuntime, nodeLock, {
            XDG_STATE_HOME: fixture.folder,
          }),
        ),
      ).rejects.toThrow("OpenCode database must be an existing file.");
      expect(adapter).not.toHaveBeenCalled();
    } finally {
      fixture.dispose();
    }
  });
});
