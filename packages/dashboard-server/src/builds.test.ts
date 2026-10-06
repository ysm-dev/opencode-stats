import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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

it.each(["first", "version", "damaged", "resume", "plugin"])(
  "reports a %s build in the terminal and private log, never ordinary sync progress",
  async (reason) => {
    const f = syntheticFixture();
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      f.writer.session("root", null, { title: "SYNTHETIC PRIVATE TITLE" });
      f.writer.message({ id: "one", session: "root", seq: 0, start: 1 });
      if (reason !== "first" && reason !== "plugin") {
        await readBuilt({ source: f.source, cacheHome: f.folder }, () => {}, nodeRuntime);
        const file = join(
          f.folder,
          "opencode-stats",
          `${createHash("sha256").update(f.source).digest("hex")}.db`,
        );
        if (reason === "damaged") writeFileSync(file, "synthetic damaged store");
        else {
          const db = new DatabaseSync(file);
          db.exec(
            reason === "version"
              ? "UPDATE metadata SET version=0"
              : "UPDATE metadata SET history_complete=0",
          );
          db.close();
        }
      }
      const port = await temporaryPort();
      const fiber = Effect.runFork(
        program(
          [
            "--db",
            f.source,
            "--port",
            String(port),
            "--starter",
            reason === "plugin" ? "plugin" : "terminal",
          ],
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
        if (reason === "plugin") expect(text).not.toContain("Reading your OpenCode history");
        else {
          expect(text.match(/Reading your OpenCode history/g)).toHaveLength(1);
          expect(text).toMatch(/\d{2}:\d{2}:\d{2}  Read 1 sessions and 1 steps in \d+\.\d s\./);
          const suffix =
            reason === "version"
              ? ` for opencode-stats ${version}`
              : reason === "damaged"
                ? ": the saved statistics were damaged"
                : reason === "resume"
                  ? ": continuing the saved build"
                  : "";
          expect(text).toContain(`Reading your OpenCode history, newest first${suffix}…`);
        }
        const log = readFileSync(join(f.folder, "opencode-stats/server.log"), "utf8");
        expect(log).toContain(`reason="${reason === "plugin" ? "first" : reason}"`);
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
