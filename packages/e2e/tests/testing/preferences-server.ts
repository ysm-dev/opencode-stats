import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { syntheticDatabase } from "@opencode-stats/stats-store/testing";
import { expect, vi } from "vitest";
import { capture } from "./process.ts";
import { killProcessTree } from "../../../../scripts/process-tree.ts";
import type { BrowserType, BrowserContextOptions } from "playwright";

export const preferencesBrowser = async (
  engine: BrowserType,
  options: BrowserContextOptions = {},
) => {
  await using resources = new AsyncDisposableStack();
  const server = resources.use(await preferencesServer());
  const browser = resources.use(await engine.launch({ headless: true }));
  const context = resources.use(await browser.newContext(options));
  context.setDefaultTimeout(3000);
  return Object.assign(resources.move(), { server, context });
};

export const preferencesServer = async () => {
  const directory = await mkdtemp(join(tmpdir(), "stats-preferences-"));
  let disposeProcess: (() => Promise<void>) | undefined;
  let disposeWriter: (() => void) | undefined;
  const close = async () => {
    try {
      await disposeProcess?.();
    } finally {
      disposeWriter?.();
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    await writeFile(join(directory, "package.json"), '{"private":true}');
    const tarball = (await readdir(resolve(".release"))).find((name) => name.endsWith(".tgz"))!;
    await promisify(execFile)(
      process.platform === "win32" ? "npm.cmd" : "npm",
      [
        "install",
        resolve(".release", tarball),
        ...["ignore-scripts", "no-audit", "no-fund", "package-lock=false"].map(
          (flag) => `--${flag}`,
        ),
      ],
      { cwd: directory, shell: process.platform === "win32" },
    );
    const database = join(directory, "synthetic.db");
    const writer = syntheticDatabase(database);
    disposeWriter = writer.close;
    writer.session("ses-preferences");
    writer.message({
      id: "msg-preferences",
      session: "ses-preferences",
      seq: 0,
      start: 1,
      tokens: { input: 987 },
    });
    const port = await temporaryPort();
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(
      "bun",
      [
        "--no-env-file",
        "--no-install",
        join(directory, "node_modules/opencode-stats/bin.js"),
        "--no-open",
        "--port",
        String(port),
        "--db",
        database,
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          ...Object.fromEntries(
            ["HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"].map((name) => [
              name,
              directory,
            ]),
          ),
        },
      },
    );
    const captured = capture(child);
    disposeProcess = async () => {
      child.kill("SIGINT");
      try {
        await vi.waitFor(() => expect(child.exitCode ?? child.signalCode).not.toBeNull(), {
          timeout: 3000,
        });
      } finally {
        if (child.exitCode === null && child.signalCode === null && child.pid)
          killProcessTree(child.pid);
        await captured.closed;
      }
    };
    await vi.waitFor(() => expect(captured.transcript.output).toContain("Press Ctrl+C to stop."), {
      timeout: 10000,
    });
    const html = await readFile(
      join(directory, "node_modules/opencode-stats/dashboard/index.html"),
      "utf8",
    );
    return { origin, html, writer, close, [Symbol.asyncDispose]: close };
  } catch (error) {
    await close();
    throw error;
  }
};
