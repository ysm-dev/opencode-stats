import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { failingTitle } from "@opencode-stats/stats-store/testing";
import { serverLog } from "./log.ts";

it("a real failing Drizzle/Effect Node SQLite query cannot put its private bound title, message, cause or raw stack into the log", async () => {
  const title = "SYNTHETIC_PRIVATE_SESSION_TITLE_39";
  const folder = mkdtempSync(join(tmpdir(), "sql-privacy-"));
  const log = serverLog(folder);
  try {
    const { failure, boundValueInLibraryMessage } = await Effect.runPromise(failingTitle(title));
    expect(boundValueInLibraryMessage).toBe(true);
    log.write({
      event: "crash",
      kind: failure.kind,
      code: failure.code,
      statement: failure.statement,
      frames: failure.frames,
    });
    const text = readFileSync(join(folder, "server.log"), "utf8");
    for (const field of ['kind="sqlite"', 'code="SQLITE_ERROR"', 'statement="writeSteps"'])
      expect(text).toContain(field);
    for (const privateText of [
      title,
      "INSERT INTO",
      "absent_session",
      "Failed query",
      "params:",
      "cause=",
    ])
      expect(text).not.toContain(privateText);
    expect(text).toContain('frames="at ');
  } finally {
    log.close();
    rmSync(folder, { recursive: true });
  }
});
