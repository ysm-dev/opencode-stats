import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { webkit } from "playwright";
import { parseRecord } from "@opencode-stats/launcher";
import { killProcessTree } from "../../../scripts/process-tree.ts";
import { capture } from "./testing/process.ts";
import { preferencesServer } from "./testing/preferences-server.ts";

it("keeps the browser controller responsive while an installer is running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preferences-install-pulse-"));
  const ready = join(directory, "ready");
  const pulse = join(directory, "pulse");
  const installer = join(directory, "installer.cjs");
  await writeFile(
    installer,
    `const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(ready)}, "ready");
setInterval(() => { if (fs.existsSync(${JSON.stringify(pulse)})) process.exit(42); }, 10);
setTimeout(() => process.exit(43), 1000);
`,
  );
  const windows = process.platform === "win32";
  const executable = join(directory, windows ? "npm.cmd" : "npm");
  await writeFile(
    executable,
    windows
      ? `@node "${installer}"\r\n`
      : `#!/bin/sh\nexec node '${installer.replaceAll("'", "'\\''")}'\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${directory}${windows ? ";" : ":"}${process.env["PATH"]}`);
  const heartbeat = setInterval(() => {
    if (existsSync(ready)) writeFileSync(pulse, "responsive");
  }, 10);
  try {
    await expect(preferencesServer()).rejects.toSatisfy(
      (error: { code?: number; status?: number }) => (error.code ?? error.status) === 42,
    );
  } finally {
    clearInterval(heartbeat);
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(["browser", "install"])(
  "cleans owned preference fixture resources after a public %s setup failure",
  async (failure) => {
    const directory = await mkdtemp(join(tmpdir(), "preferences-failure-"));
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const bin = join(directory, "bin");
      await mkdir(bin);
      const executable = process.platform === "win32" ? "npm.cmd" : "npm";
      if (failure === "install") {
        await writeFile(
          join(bin, executable),
          process.platform === "win32" ? "@exit /b 42\r\n" : "#!/bin/sh\nexit 42\n",
        );
        await chmod(join(bin, executable), 0o755);
      }
      child = spawn(
        "bun",
        [
          "run",
          "vitest",
          "run",
          "--config",
          "packages/e2e/vitest.config.ts",
          "packages/e2e/tests/preferences.test.ts",
          "--testNamePattern",
          "WebKit still loads",
        ],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            TMPDIR: directory,
            TMP: directory,
            TEMP: directory,
            PLAYWRIGHT_BROWSERS_PATH: join(directory, "absent-browsers"),
            PATH:
              failure === "install"
                ? `${bin}${process.platform === "win32" ? ";" : ":"}${process.env["PATH"]}`
                : process.env["PATH"],
          },
          stdio: "pipe",
        },
      );
      const result = capture(child);
      expect(await result.closed).toEqual([1, null]);
      expect(result.transcript.error + result.transcript.output).toContain(
        failure === "browser" ? "Executable doesn't exist" : "npm",
      );
      expect(
        (await readdir(directory)).filter((name) => name.startsWith("stats-preferences-")),
      ).toEqual([]);
    } finally {
      if (child?.pid && child.exitCode === null && child.signalCode === null)
        killProcessTree(child.pid);
      // Also stop a leaking fixture on RED, before removing its controlled directory.
      for (const name of (await readdir(directory)).filter((entry) =>
        entry.startsWith("stats-preferences-"),
      )) {
        try {
          const record = parseRecord(
            JSON.parse(await readFile(join(directory, name, "opencode-stats/server.json"), "utf8")),
          );
          killProcessTree(record.pid);
        } catch {
          /* An install failure has no server record. */
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it("closes the owned server and removes its directory when browser launch rejects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preferences-owner-"));
  let record: ReturnType<typeof parseRecord> | undefined;
  for (const key of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(key, directory);
  try {
    await expect(
      (async () => {
        await using fixture = await preferencesServer();
        const [name] = (await readdir(directory)).filter((entry) =>
          entry.startsWith("stats-preferences-"),
        );
        record = parseRecord(
          JSON.parse(await readFile(join(directory, name!, "opencode-stats/server.json"), "utf8")),
        );
        expect((await fetch(fixture.origin)).status).toBe(200);
        await using browser = await webkit.launch({
          executablePath: join(directory, "missing-browser"),
        });
        await browser.newContext();
      })(),
    ).rejects.toThrow("executable doesn't exist");
    expect(record).toBeDefined();
    expect(() => process.kill(record!.pid, 0)).toThrow(/ESRCH|no such process/iu);
    await expect(fetch(record!.address, { signal: AbortSignal.timeout(1000) })).rejects.toThrow(
      "fetch failed",
    );
    expect(
      (await readdir(directory)).filter((entry) => entry.startsWith("stats-preferences-")),
    ).toEqual([]);
  } finally {
    vi.unstubAllEnvs();
    if (record) {
      try {
        killProcessTree(record.pid);
      } catch {
        /* The fixture already stopped its server. */
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
});
