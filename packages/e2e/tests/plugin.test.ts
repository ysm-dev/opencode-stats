import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { readRecord, stateFolder } from "@opencode-stats/launcher";
import { temporaryPort, stopProcess } from "@opencode-stats/launcher/testing";
import { decode } from "@opencode-stats/browser-copy";
import pin from "../../../native/sqlite/test-runtime.json" with { type: "json" };
import { opencodeExecutable } from "../../../scripts/opencode-runtime.ts";
import { privateOpenCode } from "../../../scripts/private-opencode.ts";

it.each([
  [pin.minimum, "packed"],
  [pin.opencode, "packed"],
  [pin.opencode, "source"],
] as const)(
  "OpenCode %s privately activates the %s plugin and shares one detached server",
  async (version, mode) => {
    const home = await mkdtemp(join(tmpdir(), "stats-private-opencode-"));
    await using resources = new AsyncDisposableStack();
    resources.defer(() => rm(home, { recursive: true, force: true }));
    const tarballs = (await readdir(resolve(".release"))).filter((file) => file.endsWith(".tgz"));
    expect(tarballs).toHaveLength(1);
    await writeFile(join(home, "package.json"), JSON.stringify({ private: true }));
    execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        resolve(".release", tarballs[0]!),
      ],
      { cwd: home, timeout: 10000, shell: process.platform === "win32" },
    );
    const options = {
      executable: opencodeExecutable(version, process.env["OPENCODE_TEST_ARCH"] ?? process.arch),
      home,
      plugin:
        mode === "packed"
          ? join(home, "node_modules/opencode-stats")
          : resolve("packages/opencode-stats"),
      port: await temporaryPort(),
    };
    const first = privateOpenCode(options);
    let record: ReturnType<typeof readRecord>;
    resources.defer(async () => {
      first.child.kill("SIGTERM");
      await first.closed;
      const owned = record ?? readRecord(stateFolder(first.env));
      if (owned) await stopProcess(owned.pid);
    });
    const address = await first.address;
    const activate = async (host: typeof first, origin: string) => {
      const response = await fetch(
        `${origin}/api/plugin?location[directory]=${encodeURIComponent(home)}`,
        { headers: host.headers },
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"id":"opencode-stats"');
    };
    await vi.waitFor(() => activate(first, address), { timeout: 10000 });
    await vi.waitFor(() => expect(readRecord(stateFolder(first.env))).toBeDefined(), {
      timeout: 10000,
    });
    record = readRecord(stateFolder(first.env))!;
    expect(record.starter).toBe("plugin");
    expect(record.pid).not.toBe(first.child.pid);
    expect(record.address).toBe(`http://127.0.0.1:${options.port}`);
    const page = await fetch(record.address);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<html");
    await vi.waitFor(
      async () => {
        const copy = await fetch(`${record.address}/api/browser-copy`);
        expect(copy.status).toBe(200);
        expect(decode(await copy.arrayBuffer()).steps.start.length).toBe(0);
      },
      { timeout: 5000 },
    );
    const second = privateOpenCode(options);
    resources.defer(async () => {
      second.child.kill("SIGTERM");
      await second.closed;
    });
    const secondAddress = await second.address;
    await vi.waitFor(() => activate(second, secondAddress), { timeout: 10000 });
    expect(readRecord(stateFolder(first.env))).toEqual(record);
    first.child.kill("SIGTERM");
    await first.closed;
    expect((await fetch(record.address)).status).toBe(200);
    second.child.kill("SIGTERM");
    await second.closed;
    await vi.waitFor(
      async () => expect(await fetch(record.address).catch(() => undefined)).toBeUndefined(),
      { timeout: 15000, interval: 100 },
    );
    expect(first.transcript().output).not.toContain("opencode-stats-ready");
    expect(first.transcript().error).not.toContain("opencode-stats needs");
  },
);
