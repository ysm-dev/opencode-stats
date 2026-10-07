import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { expect, it, vi } from "vitest";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { syntheticFixture, readBuilt } from "@opencode-stats/stats-store/testing";
import { nodeRuntime } from "@opencode-stats/stats-store/node";
import { program } from "./main.ts";
import { nodeServer } from "./http.node.ts";
import { nodeLock } from "./lock.node.ts";
import { version } from "./paths.ts";

type Fixture = ReturnType<typeof syntheticFixture>;
type Reason = "first" | "version" | "damaged" | "resume" | "plugin";
async function prepareSavedBuild(f: Fixture, reason: Reason) {
  if (reason === "first" || reason === "plugin") return;
  await readBuilt({ source: f.source, cacheHome: f.folder }, () => {}, nodeRuntime);
  const file = join(
    f.folder,
    "opencode-stats",
    `${createHash("sha256").update(realpathSync(f.source)).digest("hex")}.db`,
  );
  if (reason === "damaged") {
    writeFileSync(file, "synthetic damaged store");
    return;
  }
  const db = new DatabaseSync(file);
  db.exec(
    reason === "version"
      ? "UPDATE metadata SET version=0"
      : "UPDATE metadata SET history_complete=0",
  );
  db.close();
}

const reading = "Reading your OpenCode history, newest first";
const ending = /\d{2}:\d{2}:\d{2}  Read 1 sessions and 1 steps in \d+\.\d s\./;
it.each([
  ["first", "terminal", `${reading}…`, 1, ending, "first"],
  ["version", "terminal", `${reading} for opencode-stats ${version}…`, 1, ending, "version"],
  ["damaged", "terminal", `${reading}: the saved statistics were damaged…`, 1, ending, "damaged"],
  ["resume", "terminal", `${reading}: continuing the saved build…`, 1, ending, "resume"],
  ["plugin", "plugin", "opencode-stats-ready\n", 0, /^opencode-stats-ready\n$/, "first"],
] as const)(
  "reports a %s build in the terminal and private log, never ordinary sync progress",
  async (reason, starter, startLine, startCount, endLine, logReason) => {
    const f = syntheticFixture();
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      f.writer.session("root", null, { title: "SYNTHETIC PRIVATE TITLE" });
      f.writer.message({ id: "one", session: "root", seq: 0, start: 1 });
      await prepareSavedBuild(f, reason);
      const port = await temporaryPort();
      const fiber = Effect.runFork(
        program(
          ["--db", f.source, "--port", String(port), "--starter", starter],
          nodeServer,
          nodeRuntime,
          nodeLock,
          { XDG_STATE_HOME: f.folder, XDG_CACHE_HOME: f.folder },
        ),
      );
      try {
        await vi.waitFor(() =>
          expect(readFileSync(join(f.folder, "opencode-stats/server.log"), "utf8")).toContain(
            "event=build.end",
          ),
        );
        const text = output.mock.calls.map(([line]) => String(line)).join("");
        expect(text).toContain("opencode-stats-ready\n");
        expect(text.match(/Reading your OpenCode history/g) ?? []).toHaveLength(startCount);
        expect(text).toMatch(endLine);
        expect(text).toContain(startLine);
        const log = readFileSync(join(f.folder, "opencode-stats/server.log"), "utf8");
        expect(log).toContain(`reason="${logReason}"`);
        expect(log).not.toContain("SYNTHETIC PRIVATE TITLE");
        expect(log).toMatch(/sessions=1 steps=1 milliseconds=\d+/);
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber));
      }
    } finally {
      output.mockRestore();
      f.dispose();
    }
  },
);
