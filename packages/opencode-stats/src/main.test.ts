import { describe, expect, it, vi } from "vitest";
import { run } from "./main.ts";
import { fixture, serving, installOpener } from "../testing/server.ts";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { syntheticFixture } from "@opencode-stats/stats-store/testing";

const terminal = () => ({
  output: vi.spyOn(process.stdout, "write").mockReturnValue(true),
  error: vi.spyOn(process.stderr, "write").mockReturnValue(true),
});

describe("standalone bin", () => {
  it("rejects a missing --db with its path and fix, without starting a server or opening a browser", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture("process.stdout.write('should not start\\n'); process.exit(1);");
    const opened = await installOpener(server.folder);
    const db = `${server.folder}/missing.db`;
    const { output, error } = terminal();
    try {
      expect(await run(["--db", db], { ...server, env: { PATH: server.folder } })).toBe(1);
      expect(error.mock.calls).toEqual([
        [`Can't find the OpenCode database: ${db}\nRun OpenCode once, or pass \`--db <path>\`\n`],
      ]);
      expect(output).not.toHaveBeenCalled();
      await expect(stat(db)).rejects.toThrow("ENOENT");
      await expect(readFile(opened)).rejects.toThrow("ENOENT");
    } finally {
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it("uses the same missing-file fix for a directory and an environment-selected database", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture("process.stdout.write('should not start\\n'); process.exit(1);");
    const { output, error } = terminal();
    try {
      expect(await run(["--db", server.folder], server)).toBe(1);
      expect(
        await run([], {
          ...server,
          db: undefined,
          env: { OPENCODE_DB: `${server.folder}/missing.db` },
        }),
      ).toBe(1);
      expect(error.mock.calls).toEqual([
        [
          `Can't find the OpenCode database: ${server.folder}\nRun OpenCode once, or pass \`--db <path>\`\n`,
        ],
        [
          `Can't find the OpenCode database: ${server.folder}/missing.db\nRun OpenCode once, or pass \`--db <path>\`\n`,
        ],
      ]);
      expect(output).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it("checks the runtime before even parsing flags", async () => {
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      expect(await run(["--bad"])).toBe(1);
      expect(error).toHaveBeenCalledExactlyOnceWith(
        "opencode-stats needs Bun: run `bunx opencode-stats`\n",
      );
    } finally {
      error.mockRestore();
    }
  });
  it.each(["1.3.9", "1.4.1", "0.9.9"])("rejects old Bun %s before help", async (version) => {
    vi.stubGlobal("Bun", { version });
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      expect(await run(["--help"])).toBe(1);
      expect(error).toHaveBeenCalledExactlyOnceWith(
        `opencode-stats needs Bun 1.4.2 or later (this is ${version}) · run \`bun upgrade\`\n`,
      );
    } finally {
      error.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it.each(["1.4.2", "1.5.0", "2.0.0"])(
    "reports the source version on supported Bun %s",
    async (version) => {
      vi.stubGlobal("Bun", { version });
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      try {
        expect(await run(["--version"])).toBe(0);
        expect(output).toHaveBeenCalledExactlyOnceWith("opencode-stats 0.2.0-dev\n");
      } finally {
        output.mockRestore();
        vi.unstubAllGlobals();
      }
    },
  );
  it("prints supported flags and rejects bad flags with exit 2", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const { output, error } = terminal();
    try {
      expect(await run(["--help"])).toBe(0);
      expect(output).toHaveBeenCalledExactlyOnceWith(
        "Usage: opencode-stats [--port <n>] [--db <path>] [--no-open] [--help] [--version]\n",
      );
      for (const args of [
        ["--unknown"],
        ["positional"],
        ["--port"],
        ["--port", "0"],
        ["--port", "65536"],
        ["--port", "1.5"],
        ["--port", "abc"],
        ["--db"],
        ["--db", ""],
      ]) {
        expect(await run(args)).toBe(2);
      }
      expect(error.mock.calls).toEqual(
        Array.from({ length: 9 }, () => ["Bad flags. Use `opencode-stats --help`.\n"]),
      );
    } finally {
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it("runs a foreground child, prints only after it listens, and stops both cleanly", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture(serving);
    const opened = await installOpener(server.folder);
    const { output, error } = terminal();
    const result = run(["--no-open", "--port", String(server.port)], {
      ...server,
      env: { PATH: server.folder },
      startupTimeout: 2000,
    });
    try {
      await vi.waitFor(
        () =>
          expect(output).toHaveBeenCalledWith(
            `opencode-stats 0.2.0-dev · http://127.0.0.1:${server.port}\nPress Ctrl+C to stop.\n`,
          ),
        { timeout: 5000 },
      );
      await new Promise((done) => setTimeout(done, 2200));
      await expect(readFile(opened, "utf8")).rejects.toThrow("ENOENT");
      const response = await fetch(`http://127.0.0.1:${server.port}`);
      expect(Number(await response.text())).not.toBe(process.pid);
      process.emit("SIGINT");
      expect(await result).toBe(0);
      expect(output.mock.calls).toEqual([
        [`opencode-stats 0.2.0-dev · http://127.0.0.1:${server.port}\nPress Ctrl+C to stop.\n`],
        ["Stopped.\n"],
      ]);
      expect(error).not.toHaveBeenCalled();
      await expect(fetch(`http://127.0.0.1:${server.port}`)).rejects.toThrow("fetch failed");
    } finally {
      process.emit("SIGINT");
      await result;
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it("opens once by default after readiness and leaves no signal listeners behind", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture(
      serving.replace(
        "opencode-stats-ready\\n",
        "building\\nopencode-stats-ready\\nopencode-stats-ready\\n",
      ),
    );
    const record = await installOpener(server.folder);
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    vi.stubEnv("PATH", server.folder);
    const result = run(["--port", String(server.port)], server);
    try {
      await vi.waitFor(
        async () =>
          expect(await readFile(record, "utf8")).toBe(`http://127.0.0.1:${server.port}\n`),
        { timeout: 5000 },
      );
      process.emit("SIGTERM");
      expect(await result).toBe(0);
      expect(output.mock.calls).toEqual([
        ["building\n"],
        [`opencode-stats 0.2.0-dev · http://127.0.0.1:${server.port}\nPress Ctrl+C to stop.\n`],
        ["Stopped.\n"],
      ]);
      expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
    } finally {
      process.emit("SIGINT");
      await result;
      output.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await server.clean();
    }
  });
  it("keeps serving when the browser opener is missing, with an actionable warning", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture(serving);
    const { output, error } = terminal();
    const result = run(["--port", String(server.port)], {
      ...server,
      env: { PATH: server.folder },
    });
    try {
      await vi.waitFor(
        () =>
          expect(error).toHaveBeenCalledExactlyOnceWith(
            `Couldn't open the browser. Open http://127.0.0.1:${server.port} instead.\n`,
          ),
        { timeout: 5000 },
      );
      const response = await fetch(`http://127.0.0.1:${server.port}`);
      expect(response.status).toBe(200);
      await response.text();
      process.emit("SIGINT");
      expect(await result).toBe(0);
    } finally {
      process.emit("SIGINT");
      await result;
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it.each([
    ["process.exit(0);", []],
    ["process.stderr.write('fixture failure\\n'); process.exit(1);", ["fixture failure\n"]],
    ["setInterval(()=>{},1000);", []],
  ])("reports a child that never becomes ready: %s", async (body, messages) => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture(body);
    const { output, error } = terminal();
    try {
      expect(
        await run(["--no-open", "--port", String(server.port)], {
          ...server,
          startupTimeout: 2000,
        }),
      ).toBe(1);
      expect(output).not.toHaveBeenCalled();
      expect(error.mock.calls.map((call) => call[0]?.toString())).toEqual([
        ...messages,
        "Can't start: dashboard server stopped.\n",
      ]);
    } finally {
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it("suppresses late readiness after Ctrl+C during startup", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const server = await fixture(
      "process.on('SIGINT',()=>{process.stdout.write('opencode-stats-ready\\n'); process.exit(0);}); process.stdout.write('waiting\\n'); setInterval(()=>{},1000);",
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const result = run([], server);
    try {
      await vi.waitFor(() => expect(output).toHaveBeenCalledExactlyOnceWith("waiting\n"), {
        timeout: 5000,
      });
      process.emit("SIGINT");
      expect(await result).toBe(0);
      expect(output.mock.calls).toEqual([["waiting\n"], ["Stopped.\n"]]);
    } finally {
      process.emit("SIGINT");
      await result;
      output.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it("reports a missing executable and stops safely before readiness", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const { output, error } = terminal();
    const server = await fixture(
      "process.stdout.write('waiting\\n'); setTimeout(()=>process.stdout.write('opencode-stats-ready\\n'),100); setInterval(()=>{},1000);",
    );
    try {
      const timers = process.getActiveResourcesInfo().filter((name) => name === "Timeout");
      expect(await run(["--no-open"], { executable: "/does-not-exist", db: server.db })).toBe(1);
      expect(process.getActiveResourcesInfo().filter((name) => name === "Timeout")).toEqual(timers);
      expect(error).toHaveBeenCalledExactlyOnceWith("Can't start: dashboard server stopped.\n");
      const result = run(["--port", "1"], server);
      await vi.waitFor(() => expect(output).toHaveBeenCalledExactlyOnceWith("waiting\n"));
      process.emit("SIGINT");
      expect(await result).toBe(0);
      expect(output.mock.calls).toEqual([["waiting\n"], ["Stopped.\n"]]);
    } finally {
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  });
  it("finds the source server through fixed paths when only a Bun executable is supplied", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const fixtureFiles = await fixture("");
    const { output, error } = terminal();
    const executable = execFileSync("bun", ["--print", "process.execPath"], {
      encoding: "utf8",
    }).trim();
    const database = syntheticFixture();
    const result = run(
      ["--no-open", "--port", String(fixtureFiles.port), "--db", database.source],
      {
        executable,
        env: { ...process.env, HOME: database.folder, XDG_CACHE_HOME: database.folder },
      },
    );
    try {
      await vi.waitFor(
        () =>
          expect(output).toHaveBeenCalledExactlyOnceWith(
            `opencode-stats 0.2.0-dev · http://127.0.0.1:${fixtureFiles.port}\nPress Ctrl+C to stop.\n`,
          ),
        { timeout: 5000 },
      );
      const response = await fetch(`http://127.0.0.1:${fixtureFiles.port}/api/unimplemented`);
      expect(response.status).toBe(404);
      await response.text();
      process.emit("SIGINT");
      expect(await result).toBe(0);
      expect(error).not.toHaveBeenCalled();
    } finally {
      process.emit("SIGINT");
      await result;
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      await fixtureFiles.clean();
      database.dispose();
    }
  });
  it("uses the current executable, source script and environment when none are supplied", async () => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      const database = syntheticFixture();
      vi.stubEnv("OPENCODE_DB", database.source);
      expect(await run(["--no-open", "--port", "65535"])).toBe(1);
      database.dispose();
      expect(error.mock.calls[0]?.[0]?.toString()).toContain("--no-env-file");
      expect(error).toHaveBeenLastCalledWith("Can't start: dashboard server stopped.\n");
    } finally {
      error.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
