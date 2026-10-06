import {
  chmodSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vitest";
import { stayInSync } from "./store.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { fiveTokens } from "./testing/fingerprint.ts";
import { tokenFacts } from "./testing/canonical.ts";
const home = vi.hoisted(() => ({ path: "" }));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    rmSync: vi.fn<typeof fs.rmSync>(fs.rmSync),
    chmodSync: vi.fn<typeof fs.chmodSync>(fs.chmodSync),
  };
});
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => home.path,
}));

it("builds every assistant step, keeping the five recorded token kinds independent of missing usage", async () => {
  const { folder, source, writer, dispose } = syntheticFixture();
  try {
    writer.session("ses-synthetic");
    writer.message({
      id: "msg-one",
      session: "ses-synthetic",
      seq: 0,
      start: 1000,
      tokens: fiveTokens,
    });
    writer.message({ id: "msg-missing", session: "ses-synthetic", seq: 1, start: 2000 });
    const commits: number[] = [];
    const steps = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* stayInSync({ source, cacheHome: folder }, nodeRuntime, (copy) => {
            commits.push(copy.revision);
          });
          return (yield* store.read()).steps;
        }),
      ),
    );
    expect(tokenFacts(steps)).toEqual([
      { start: 1000, input: 11, cacheRead: 22, cacheWrite: 33, output: 44, reasoning: 55 },
      {
        start: 2000,
        input: null,
        cacheRead: null,
        cacheWrite: null,
        output: null,
        reasoning: null,
      },
    ]);
    expect(commits).toEqual([1]);
  } finally {
    dispose();
  }
});

it("uses XDG_CACHE_HOME or the private home cache, never creates a missing source, and rejects directories", async () => {
  const fixture = syntheticFixture();
  home.path = fixture.folder;
  const previous = process.env["XDG_CACHE_HOME"];
  try {
    process.env["XDG_CACHE_HOME"] = join(fixture.folder, "xdg");
    await readBuilt({ source: fixture.source });
    expect(statSync(join(fixture.folder, "xdg/opencode-stats")).mode & 0o777).toBe(0o700);
    process.env["XDG_CACHE_HOME"] = "";
    await readBuilt({ source: fixture.source });
    expect(statSync(join(fixture.folder, ".cache/opencode-stats")).mode & 0o777).toBe(0o700);
    await expect(readBuilt({ source: fixture.folder })).rejects.toMatchObject({
      message: "OpenCode database must be an existing readable file.",
    });
    await expect(readBuilt({ source: `${fixture.source}.missing` })).rejects.toMatchObject({
      message: "OpenCode database must be an existing readable file.",
    });
    expect(() => statSync(`${fixture.source}.missing`)).toThrow("ENOENT");
  } finally {
    if (previous === undefined) delete process.env["XDG_CACHE_HOME"];
    else process.env["XDG_CACHE_HOME"] = previous;
    fixture.dispose();
  }
});

it("reuses the cache by resolved source path and rebuilds another version or an unreadable store", async () => {
  const fixture = syntheticFixture();
  try {
    const options = { source: fixture.source, cacheHome: fixture.folder };
    const first = await readBuilt(options);
    expect(first.steps).toEqual([]);
    expect(first.historyCompleteFrom).toBe(0);
    const alias = join(fixture.folder, "alias.db");
    symlinkSync(fixture.source, alias);
    expect((await readBuilt({ ...options, source: alias })).generation).toBe(first.generation);
    const filename = join(
      fixture.folder,
      "opencode-stats",
      readdirSync(join(fixture.folder, "opencode-stats"))[0]!,
    );
    chmodSync(join(fixture.folder, "opencode-stats"), 0o777);
    chmodSync(filename, 0o666);
    await readBuilt(options);
    expect(statSync(join(fixture.folder, "opencode-stats")).mode & 0o777).toBe(0o700);
    expect(statSync(filename).mode & 0o777).toBe(0o600);
    const db = new DatabaseSync(filename);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("UPDATE metadata SET revision=revision");
    chmodSync(`${filename}-wal`, 0o666);
    chmodSync(`${filename}-shm`, 0o666);
    const permissionCheck = await readBuilt(options);
    expect(permissionCheck.generation).toBe(first.generation);
    expect(statSync(`${filename}-wal`).mode & 0o777).toBe(0o600);
    expect(statSync(`${filename}-shm`).mode & 0o777).toBe(0o600);
    expect(chmodSync).toHaveBeenCalledWith(`${filename}-wal`, 0o600);
    expect(chmodSync).toHaveBeenCalledWith(`${filename}-shm`, 0o600);
    db.exec("UPDATE metadata SET version=0");
    db.close();
    const rebuilt = await readBuilt(options);
    expect(rebuilt.generation).not.toBe(first.generation);
    expect(rebuilt.revision).toBe(1);
    writeFileSync(filename, "synthetic corrupt SQLite");
    expect((await readBuilt(options)).generation).not.toBe(rebuilt.generation);
    expect(rmSync).toHaveBeenCalledWith(`${filename}-wal`, { force: true });
    expect(rmSync).toHaveBeenCalledWith(`${filename}-shm`, { force: true });
  } finally {
    fixture.dispose();
  }
});

it.each([
  { start: Number.MIN_SAFE_INTEGER - 1 },
  { start: Number.MAX_SAFE_INTEGER + 1 },
  { start: 0.5 },
  { start: 1000, tokens: { input: -1 } },
])(
  "refuses unsafe source scalars ($start, $tokens) without exposing private details",
  async (scenario) => {
    const fixture = syntheticFixture();
    try {
      fixture.writer.session("ses-unsafe");
      fixture.writer.message({
        id: "msg-unsafe",
        session: "ses-unsafe",
        seq: 0,
        ...scenario,
        content: "SYNTHETIC SECRET",
      });
      await expect(
        readBuilt({ source: fixture.source, cacheHome: fixture.folder }, () => {}, nodeRuntime),
      ).rejects.toMatchObject({ message: "Stats store build failed." });
    } finally {
      fixture.dispose();
    }
  },
);

it("counts incomplete and failed steps, recorded zeroes and start rewrites, but never fork copies or non-assistants", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  try {
    writer.session("ses-empty");
    writer.session("ses-fork");
    writer.session("ses-origin");
    const message = {
      id: "msg-original",
      session: "ses-origin",
      seq: 0,
      start: 1234,
      tokens: { input: 0, cache: { read: 0 }, reasoning: 7 },
      error: "synthetic.failure",
    };
    writer.message(message);
    writer.message({ ...message, start: 5678 });
    writer.message({ ...message, id: "msg_abcdefghijklmnopqrstuvwxyz_12", session: "ses-fork" });
    writer.message({ ...message, id: "msg-user", seq: 1, type: "user" });
    writer.message({ ...message, id: "msg-tool", seq: 2, type: "tool" });
    writer.message({ ...message, id: "msg_abcdefghijklmnopqrstuvwxyz_suffix", seq: 3 });
    writer.message({ ...message, id: "prefix-msg_abcdefghijklmnopqrstuvwxyz_1", seq: 4 });
    writer.message({ ...message, id: "msg_abcdefghijklmnopqrstuvwxyz_1_suffix", seq: 5 });
    const expected = {
      start: 5678,
      input: 0,
      cacheRead: 0,
      cacheWrite: null,
      output: null,
      reasoning: 7,
    };
    const copy = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* stayInSync({ source, cacheHome: folder }, nodeRuntime, () => {});
          return yield* store.read();
        }),
      ),
    );
    expect(tokenFacts(copy.steps)).toEqual([
      expected,
      ...Array.from({ length: 3 }, () => ({ ...expected, start: 1234 })),
    ]);
    expect(copy.historyCompleteFrom).toBe(1234);
    const cache = join(folder, "opencode-stats");
    expect(statSync(cache).mode & 0o777).toBe(0o700);
    const files = readdirSync(cache);
    expect(files.some((file) => /^[a-f0-9]{64}\.db$/u.test(file))).toBe(true);
    for (const file of files) {
      expect(statSync(join(cache, file)).mode & 0o777).toBe(0o600);
      expect(
        readFileSync(join(cache, file)).includes(Buffer.from("SYNTHETIC PRIVATE CONTENT")),
      ).toBe(false);
      expect(readFileSync(join(cache, file)).includes(Buffer.from("SYNTHETIC PRIVATE ERROR"))).toBe(
        false,
      );
    }
  } finally {
    fixture.dispose();
  }
});
