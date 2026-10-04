import { expect, test } from "bun:test";
import * as Exit from "effect/Exit";
import { bunDatabase, bunRuntime } from "./runtime.bun.ts";
import { attemptSourceWrite } from "./testing/store.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";

test("native Bun SQLite is readonly for OpenCode, and the native worker alone builds the stats store", async () => {
  const fixture = syntheticFixture();
  try {
    fixture.writer.session("ses-contract");
    fixture.writer.message({
      id: "msg-contract",
      session: "ses-contract",
      seq: 0,
      start: 999,
      tokens: { output: 4, reasoning: 0 },
    });
    const copy = await readBuilt(
      { source: fixture.source, cacheHome: fixture.folder },
      () => {},
      bunRuntime,
    );
    expect(copy.steps).toEqual([
      { start: 999, input: null, cacheRead: null, cacheWrite: null, output: 4, reasoning: 0 },
    ]);
    const failure = await attemptSourceWrite(fixture.source, bunDatabase);
    expect(Exit.isFailure(failure)).toBe(true);
  } finally {
    fixture.dispose();
  }
});
