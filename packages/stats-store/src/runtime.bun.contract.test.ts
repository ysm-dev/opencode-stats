import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    const before = readFileSync(fixture.source);
    const walBefore = readFileSync(`${fixture.source}-wal`);
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
    expect(readFileSync(fixture.source)).toEqual(before);
    expect(readFileSync(`${fixture.source}-wal`)).toEqual(walBefore);
    const missing = `${fixture.source}.missing`;
    expect(Exit.isFailure(await attemptSourceWrite(missing, bunDatabase))).toBe(true);
    expect(existsSync(missing)).toBe(false);
  } finally {
    fixture.dispose();
  }
});

test("public Bun runtime reads an inactive companion-free WAL source without changing its main bytes or allowing writes", async () => {
  const folder = mkdtempSync(join(tmpdir(), "stats-inactive-wal-"));
  const source = join(folder, "synthetic.db");
  try {
    // The actual Node fixture builder checkpoints/closes its native writer.
    // No product connection performs a source checkpoint or journal change.
    const produced = spawnSync(
      "node",
      [
        "--experimental-strip-types",
        "--input-type=module",
        "--eval",
        `import {syntheticDatabase} from ${JSON.stringify(new URL("./testing/index.ts", import.meta.url).href)}; const writer=syntheticDatabase(process.argv[1]);writer.session("ses-inactive");writer.message({id:"msg-inactive",session:"ses-inactive",seq:0,start:1234567890000,tokens:{input:7,output:0}});writer.close();`,
        source,
      ],
      { encoding: "utf8" },
    );
    expect(produced.status, produced.stderr).toBe(0);
    expect(existsSync(`${source}-wal`)).toBe(false);
    expect(existsSync(`${source}-shm`)).toBe(false);
    const before = readFileSync(source);
    try {
      const copy = await readBuilt({ source, cacheHome: folder }, () => {}, bunRuntime);
      expect(copy.steps).toEqual([
        {
          start: 1234567890000,
          input: 7,
          cacheRead: null,
          cacheWrite: null,
          output: 0,
          reasoning: null,
        },
      ]);
      expect(Exit.isFailure(await attemptSourceWrite(source, bunDatabase))).toBe(true);
    } finally {
      expect(readFileSync(source)).toEqual(before);
    }
  } finally {
    rmSync(folder, { recursive: true });
  }
});
