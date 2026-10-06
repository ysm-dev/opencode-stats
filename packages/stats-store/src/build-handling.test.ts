import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";
import type { BuildEvent, StoreCopy } from "./store.ts";

const filename = (source: string, folder: string) =>
  join(folder, "opencode-stats", `${createHash("sha256").update(source).digest("hex")}.db`);

it("reports first builds once, not ordinary starts, and reports release rebuilds with fresh generations", async () => {
  const f = syntheticFixture();
  const events: BuildEvent[] = [];
  const options = { source: f.source, cacheHome: f.folder };
  try {
    f.writer.session("root");
    f.writer.session("child", "root");
    f.writer.message({ id: "one", session: "root", seq: 0, start: 2 });
    f.writer.message({ id: "two", session: "child", seq: 0, start: 1 });
    const first = await readBuilt(
      options,
      () => {},
      nodeRuntime,
      (event) => events.push(event),
    );
    expect(first.historyComplete).toBe(true);
    expect(events).toMatchObject([
      { kind: "build.start", reason: "first", sessions: 0, steps: 0, milliseconds: 0 },
      { kind: "build.end", reason: "first", sessions: 1, steps: 2 },
    ]);
    expect(events[1]!.milliseconds).toBeGreaterThanOrEqual(0);
    await readBuilt(
      options,
      () => {},
      nodeRuntime,
      (event) => events.push(event),
    );
    expect(events).toHaveLength(2);
    const db = new DatabaseSync(filename(f.source, f.folder));
    db.exec("ALTER TABLE metadata DROP COLUMN history_complete; UPDATE metadata SET version=0");
    db.close();
    const next = await readBuilt(
      options,
      () => {},
      nodeRuntime,
      (event) => events.push(event),
    );
    expect(next.generation).not.toBe(first.generation);
    expect(events.slice(2)).toMatchObject([
      { kind: "build.start", reason: "version" },
      { kind: "build.end", reason: "version" },
    ]);
  } finally {
    f.dispose();
  }
});

it.each(["not-sqlite", "corrupt-pages", "integrity", "layout"])(
  "safely rebuilds %s damage and reports only safe counts and reason",
  async (damage) => {
    const f = syntheticFixture();
    try {
      const options = { source: f.source, cacheHome: f.folder };
      const old = await readBuilt(options, () => {}, nodeRuntime);
      const file = filename(f.source, f.folder);
      if (damage === "not-sqlite") writeFileSync(file, "synthetic damaged statistics");
      else if (damage === "corrupt-pages") {
        const bytes = readFileSync(file);
        bytes[100] = 0;
        writeFileSync(file, bytes);
      } else {
        const db = new DatabaseSync(file);
        if (damage === "layout") db.exec("ALTER TABLE metadata DROP COLUMN history_complete");
        else {
          db.exec("PRAGMA writable_schema=ON");
          db.prepare(
            "UPDATE sqlite_schema SET sql=replace(sql, '`revision` integer NOT NULL', '`revision` integer NOT NULL CHECK(revision<0)') WHERE name='metadata'",
          ).run();
        }
        db.close();
      }
      const events: BuildEvent[] = [];
      const rebuilt = await readBuilt(
        options,
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(rebuilt.generation).not.toBe(old.generation);
      expect(events).toMatchObject([
        { kind: "build.start", reason: "damaged" },
        { kind: "build.end", sessions: 0, steps: 0 },
      ]);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      f.dispose();
    }
  },
);

it("prioritizes new activity between build units while preserving complete unit placement and resume", async () => {
  const f = syntheticFixture();
  try {
    f.writer.session("root");
    f.writer.session("child", "root");
    f.writer.session("old");
    f.writer.message({ id: "root-step", session: "root", seq: 0, start: 3000 });
    f.writer.message({ id: "child-step", session: "child", seq: 0, start: 1000 });
    f.writer.message({ id: "old-step", session: "old", seq: 0, start: 2000 });
    const commits: StoreCopy[] = [];
    await readBuilt(
      { source: f.source, cacheHome: f.folder },
      (copy) => {
        commits.push(copy);
        if (commits.length === 1) {
          f.writer.session("new");
          f.writer.message({ id: "new-step", session: "new", seq: 0, start: 4000 });
        }
      },
      nodeRuntime,
    );
    expect(commits.map((copy) => copy.facts.map((fact) => fact.id))).toEqual([
      ["child-step", "root-step"],
      ["child-step", "new-step", "root-step"],
      ["child-step", "new-step", "old-step", "root-step"],
    ]);
    expect(commits.map((copy) => [copy.historyComplete, copy.historyCompleteFrom])).toEqual([
      [false, 2000],
      [false, 2000],
      [true, 1000],
    ]);
  } finally {
    f.dispose();
  }
});

it("empty ancestors do not invent a latest instant, and empty units do not hold back complete activity", async () => {
  const f = syntheticFixture();
  try {
    f.writer.session("old-root");
    f.writer.session("old-child", "old-root");
    f.writer.session("new");
    f.writer.session("empty");
    f.writer.message({ id: "old-step", session: "old-child", seq: 0, start: -3000 });
    f.writer.message({ id: "new-step", session: "new", seq: 0, start: -1000 });
    const commits: StoreCopy[] = [];
    await readBuilt(
      { source: f.source, cacheHome: f.folder },
      (copy) => commits.push(copy),
      nodeRuntime,
    );
    expect(commits.map((copy) => copy.facts.map((fact) => fact.id))).toEqual([
      ["new-step"],
      ["new-step", "old-step"],
      ["new-step", "old-step"],
    ]);
    expect(commits.map((copy) => [copy.historyComplete, copy.historyCompleteFrom])).toEqual([
      [false, -3000],
      [true, -3000],
      [true, -3000],
    ]);
  } finally {
    f.dispose();
  }
});

it("cleans only authenticated cache names for vanished databases, never the served store or unrelated files", async () => {
  const f = syntheticFixture();
  const vanished = syntheticFixture();
  try {
    const active = await readBuilt(
      { source: f.source, cacheHome: f.folder },
      () => {},
      nodeRuntime,
    );
    await readBuilt({ source: vanished.source, cacheHome: f.folder }, () => {}, nodeRuntime);
    const stale = filename(vanished.source, f.folder);
    vanished.dispose();
    writeFileSync(`${stale}-wal`, "derived sidecar");
    writeFileSync(`${stale}-shm`, "derived sidecar");
    const unowned = join(f.folder, "opencode-stats", `${"0".repeat(64)}.db.source`);
    writeFileSync(unowned, "not the path this filename authenticates");
    const unreadable = join(f.folder, "opencode-stats", `${"1".repeat(64)}.db.source`);
    symlinkSync(join(f.folder, "missing-metadata"), unreadable);
    const live = filename(f.source, f.folder);
    expect(readFileSync(`${live}.source`, "utf8")).toBe(f.source);
    const next = await readBuilt({ source: f.source, cacheHome: f.folder }, () => {}, nodeRuntime);
    expect(next.generation).toBe(active.generation);
    expect([stale, `${stale}-wal`, `${stale}-shm`, `${stale}.source`].some(existsSync)).toBe(false);
    expect(existsSync(unowned)).toBe(true);
    rmSync(unowned);
  } finally {
    f.dispose();
  }
});

it("never removes the served OpenCode file even when it occupies an obsolete stats-store name", async () => {
  const f = syntheticFixture();
  try {
    await readBuilt({ source: f.source, cacheHome: f.folder }, () => {}, nodeRuntime);
    f.writer.close();
    const file = filename("/synthetic-vanished-source.db", f.folder);
    renameSync(f.source, file);
    writeFileSync(`${file}.source`, "/synthetic-vanished-source.db");
    const copy = await readBuilt({ source: file, cacheHome: f.folder }, () => {}, nodeRuntime);
    expect(copy.historyComplete).toBe(true);
    expect(existsSync(file)).toBe(true);
  } finally {
    f.dispose();
  }
});
