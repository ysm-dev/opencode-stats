import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishRecord } from "@opencode-stats/launcher";
import { expect, it, vi } from "vitest";
import { run } from "./main.ts";
import { readFile } from "node:fs/promises";
import { fixture, installOpener } from "../testing/server.ts";
import { listen, serverRecord } from "@opencode-stats/launcher/testing";

it("prints the running terminal server's actual identity and exits without spawning, or reports the exact database conflict", async () => {
  vi.stubGlobal("Bun", { version: "1.4.2" });
  const folder = mkdtempSync(join(tmpdir(), "join-bin-"));
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  let record: Parameters<typeof publishRecord>[1];
  const server = createServer((request, response) => {
    expect(request.headers.authorization).toBe(`Bearer ${record.secret}`);
    response.end(JSON.stringify(record));
  });
  record = serverRecord(await listen(server), { version: "0.1.0", starter: "terminal" });
  publishRecord(join(folder, "opencode-stats"), record);
  const options = { executable: "/must-not-spawn", env: { XDG_STATE_HOME: folder } };
  try {
    expect(await run(["--no-open", "--db", record.database], options)).toBe(0);
    expect(output).toHaveBeenCalledExactlyOnceWith(
      `opencode-stats 0.1.0 · ${record.address} · already running, started in a terminal\nDatabase: /synthetic/a.db\n`,
    );
    expect(await run(["--no-open", "--db", "/synthetic/b.db"], options)).toBe(1);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      `A dashboard server for \`/synthetic/a.db\` is already running (opencode-stats 0.1.0, started in a terminal, ${record.address}). opencode-stats serves one OpenCode database at a time.\n`,
    );
    error.mockClear();
    output.mockClear();
    record = { ...record, version: "99.0.0", starter: "plugin" };
    publishRecord(join(folder, "opencode-stats"), record);
    expect(
      await run(["--db", record.database], { ...options, env: { ...options.env, PATH: folder } }),
    ).toBe(0);
    expect(output).toHaveBeenCalledExactlyOnceWith(
      `opencode-stats 99.0.0 · ${record.address} · already running, started by OpenCode\nDatabase: /synthetic/a.db\n`,
    );
    expect(error).toHaveBeenCalledExactlyOnceWith(
      `Couldn't open the browser. Open ${record.address} instead.\n`,
    );
    const opened = await installOpener(folder);
    const observer = watch(folder);
    const completed = new Promise<void>((done, reject) => {
      observer.on("error", reject);
      observer.on("change", (_event, file) => {
        if (file === "opened") done();
      });
    });
    error.mockClear();
    try {
      expect(
        await run(["--db", record.database], { ...options, env: { ...options.env, PATH: folder } }),
      ).toBe(0);
      await completed;
      expect(await readFile(opened, "utf8")).toBe(`${record.address}\n`);
    } finally {
      observer.close();
    }
    expect(error).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    output.mockRestore();
    error.mockRestore();
    vi.unstubAllGlobals();
    rmSync(folder, { recursive: true });
  }
});

it.each([false, true])(
  "a lock-loser child joins the winner, or reports its database conflict: %s",
  async (conflict) => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const files = await fixture("process.stdout.write('waiting\\n'); process.exit(0);");
    let answering = false;
    const output = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
      if (value === "waiting\n") answering = true;
      return true;
    });
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    let record: Parameters<typeof publishRecord>[1];
    const server = createServer((_request, response) =>
      response.end(JSON.stringify(answering ? record : {})),
    );
    record = serverRecord(await listen(server), {
      starter: "terminal",
      database: realpathSync(files.db),
    });
    publishRecord(join(files.folder, "opencode-stats"), record);
    const requested = conflict ? join(files.folder, "other.db") : files.db;
    writeFileSync(requested, "synthetic source");
    try {
      expect(
        await run(["--no-open", "--db", requested], {
          ...files,
          env: { XDG_STATE_HOME: files.folder },
        }),
      ).toBe(conflict ? 1 : 0);
      expect(output).toHaveBeenCalledWith("waiting\n");
      expect(error.mock.calls).toEqual(
        conflict
          ? [
              [
                `A dashboard server for \`${record.database}\` is already running (opencode-stats 1.3.0, started in a terminal, ${record.address}). opencode-stats serves one OpenCode database at a time.\n`,
              ],
            ]
          : [],
      );
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await files.clean();
    }
  },
);

it("a native failure at the environment/discovery boundary cannot print library text", async () => {
  vi.stubGlobal("Bun", { version: "1.4.2" });
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    expect(
      await run(["--no-open"], {
        env: {
          get XDG_STATE_HOME(): string {
            throw new Error("PRIVATE_NATIVE_ENVIRONMENT_TITLE");
          },
        },
      }),
    ).toBe(1);
    expect(error).toHaveBeenCalledExactlyOnceWith("Can't start: dashboard server unavailable.\n");
  } finally {
    error.mockRestore();
    vi.unstubAllGlobals();
  }
});
