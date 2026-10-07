import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { start } from "./start.ts";
import { execFileSync } from "node:child_process";
import { text } from "node:stream/consumers";
const home = vi.hoisted(() => ({ path: "" }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home.path,
}));

describe("launcher start command", () => {
  it.each(["flag", "environment", "xdg", "home", "fallback"])(
    "passes an absolute source address selected by %s without opening it",
    async (kind) => {
      const folder = await mkdtemp(join(tmpdir(), "stats-source-address-"));
      home.path = join(folder, "fallback-home");
      const executable = join(folder, "host");
      await writeFile(
        executable,
        `#!${process.execPath}\nprocess.stdout.write(process.argv.at(-1));`,
        { mode: 0o700 },
      );
      const env: NodeJS.ProcessEnv = {};
      if (kind === "flag" || kind === "environment")
        env["OPENCODE_DB"] = join(folder, "environment.db");
      if (kind === "xdg") env["XDG_DATA_HOME"] = join(folder, "data");
      if (kind === "home") env["HOME"] = folder;
      try {
        const child = start({
          executable,
          script: join(folder, "server.ts"),
          port: 22439,
          env,
          db: kind === "flag" ? join(folder, "chosen.db") : undefined,
        });
        const [output, status] = await Promise.all([text(child.stdout), once(child, "close")]);
        expect(status).toEqual([0, null]);
        const expected =
          kind === "flag"
            ? join(folder, "chosen.db")
            : kind === "environment"
              ? join(folder, "environment.db")
              : kind === "xdg"
                ? join(folder, "data/opencode/opencode.db")
                : kind === "home"
                  ? join(folder, ".local/share/opencode/opencode.db")
                  : join(folder, "fallback-home/.local/share/opencode/opencode.db");
        expect(output).toBe(expected);
      } finally {
        await rm(folder, { recursive: true });
      }
    },
  );
  it("runs the supplied executable as Bun without credentials, env files or preloads", async () => {
    const folder = await mkdtemp(join(tmpdir(), "stats-launcher-"));
    const executable = join(folder, "host");
    await writeFile(
      executable,
      `#!${process.execPath}\ndelete process.env.__CF_USER_TEXT_ENCODING; process.stdout.write(JSON.stringify({args:process.argv.slice(2),env:process.env}));`,
      { mode: 0o700 },
    );
    try {
      const needed = {
        HOME: folder,
        USERPROFILE: folder,
        SystemRoot: folder,
        WINDIR: folder,
        TMPDIR: folder,
        TMP: folder,
        TEMP: folder,
        XDG_STATE_HOME: folder,
        XDG_CACHE_HOME: folder,
        XDG_DATA_HOME: folder,
        OPENCODE_DB: "synthetic.db",
        NO_COLOR: "1",
      };
      const child = start({
        executable,
        script: join(folder, "server.ts"),
        port: 22439,
        env: {
          ...needed,
          API_KEY: "secret",
          NODE_OPTIONS: "--require=evil",
          BUN_BE_BUN: "0",
        },
      });
      const [output, status] = await Promise.all([text(child.stdout), once(child, "close")]);
      expect(status).toEqual([0, null]);
      expect(JSON.parse(output)).toEqual({
        args: [
          "--no-env-file",
          expect.stringMatching(/^--config=.+empty-bunfig.toml$/u),
          "--no-install",
          join(folder, "server.ts"),
          "--port",
          "22439",
          "--db-source",
          "(`OPENCODE_DB`)",
          "--db",
          join(folder, "opencode/synthetic.db"),
        ],
        env: { ...needed, BUN_BE_BUN: "1" },
      });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it("ignores the caller's actual .env and Bun preloads on real Bun", async () => {
    const executable = execFileSync("bun", ["--print", "process.execPath"], {
      encoding: "utf8",
    }).trim();
    const folder = await mkdtemp(join(tmpdir(), "stats-start-flags-"));
    const script = join(folder, "server.ts");
    await writeFile(join(folder, ".env"), "LOADED_FROM_ENV=bad\n");
    await writeFile(join(folder, "bunfig.toml"), 'preload = ["./poison.ts"]\n');
    await writeFile(join(folder, "poison.ts"), 'throw new Error("Caller preload ran");\n');
    await writeFile(
      script,
      "process.stdout.write(JSON.stringify({ loaded: process.env.LOADED_FROM_ENV ?? null, host: process.env.BUN_BE_BUN }));\n",
    );
    try {
      const child = start({ executable, script, port: 22439, env: { HOME: folder } });
      const [output, status] = await Promise.all([text(child.stdout), once(child, "close")]);
      expect(status).toEqual([0, null]);
      expect(JSON.parse(output)).toEqual({ loaded: null, host: "1" });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
