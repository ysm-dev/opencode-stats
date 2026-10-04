import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { once } from "node:events";
import { syntheticDatabase } from "@opencode-stats/stats-store/testing";
import { decode } from "@opencode-stats/browser-copy";
import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";
const release = resolve(".release");

describe("installed release", () => {
  it("installs only our tarball with lifecycle scripts off and serves it under --no-install", async () => {
    const tarballs = (await readdir(release)).filter((file) => file.endsWith(".tgz"));
    expect(tarballs).toHaveLength(1);
    const folder = await mkdtemp(join(tmpdir(), "stats-installed-"));
    let writer: ReturnType<typeof syntheticDatabase> | undefined;
    await writeFile(join(folder, "package.json"), JSON.stringify({ private: true }));
    try {
      execFileSync(
        npm,
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          join(release, String(tarballs[0])),
        ],
        { cwd: folder, shell },
      );
      const installed = join(folder, "node_modules/opencode-stats");
      expect(
        (await readdir(join(folder, "node_modules"))).filter((name) => !name.startsWith(".")),
      ).toEqual(["opencode-stats"]);
      expect(JSON.parse(await readFile(join(installed, "package.json"), "utf8"))).toMatchObject({
        name: "opencode-stats",
        version: "0.2.0",
        engines: { bun: ">=1.4.2" },
      });
      const manifest = await readFile(join(installed, "package.json"), "utf8");
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
        "scripts",
        "private",
      ])
        expect(manifest).not.toContain(`"${field}"`);
      const bin = join(installed, "bin.js");
      const notices = await readFile(join(installed, "THIRD_PARTY_NOTICES.md"), "utf8");
      expect(notices).toContain("## effect 4.0.0");
      expect(notices).toContain("## drizzle-orm 1.0.0-rc.5-5935859");
      expect(notices).toContain("Apache License");
      expect(notices).toContain("## katex");
      expect(notices).toContain("SIL OPEN FONT LICENSE Version 1.1");
      expect(
        (await readdir(join(installed, "dashboard/assets"))).filter((file) => file.endsWith(".js")),
      ).toHaveLength(1);
      for (const name of ["bin", "process", "sync-worker"]) {
        const code = await readFile(join(installed, `${name}.js`), "utf8");
        expect(code).toContain("// opencode-stats 0.2.0");
        expect(code).toContain(`//# sourceMappingURL=${name}.js.map`);
        expect(
          JSON.parse(await readFile(join(installed, `${name}.js.map`), "utf8")),
        ).toHaveProperty("sourcesContent");
      }
      expect(await readFile(bin, "utf8")).toMatch(/^#!\/usr\/bin\/env bun\n/u);
      const command = process.platform === "win32" ? "bun" : bin;
      const prefix = process.platform === "win32" ? ["--no-install", bin] : [];
      expect(
        execFileSync(command, [...prefix, "--version"], { cwd: folder, encoding: "utf8" }),
      ).toBe("opencode-stats 0.2.0\n");
      expect(execFileSync(command, [...prefix, "--help"], { cwd: folder, encoding: "utf8" })).toBe(
        "Usage: opencode-stats [--port <n>] [--db <path>] [--no-open] [--help] [--version]\n",
      );
      const node = spawn(process.execPath, [bin, "--help"], { cwd: folder });
      let message = "";
      node.stderr.on("data", (chunk: Buffer) => {
        message += chunk.toString();
      });
      expect(await once(node, "close")).toEqual([1, null]);
      expect(message).toBe("opencode-stats needs Bun: run `bunx opencode-stats`\n");
      const db = syntheticDatabase(join(folder, "synthetic.db"));
      writer = db;
      db.session("ses-installed");
      db.message({
        id: "msg-installed",
        session: "ses-installed",
        seq: 0,
        start: 1234567890000,
        tokens: { input: 1, cache: { read: 2, write: 3 }, output: 4, reasoning: 5 },
      });
      // Like OpenCode, keep the WAL writer alive while its readonly consumer
      // runs. Bun rejects a checkpointed WAL file with no coordination files.
      const port = await temporaryPort();
      const origin = `http://127.0.0.1:${port}`;
      const child = spawn(
        command,
        [...prefix, "--no-open", "--port", String(port), "--db", join(folder, "synthetic.db")],
        {
          cwd: folder,
          detached: true,
          env: {
            ...process.env,
            OPENCODE_DB: join(folder, "missing-override.db"),
            HOME: folder,
            XDG_STATE_HOME: folder,
            XDG_CACHE_HOME: folder,
            XDG_DATA_HOME: folder,
          },
        },
      );
      const exit = once(child, "close");
      let output = "";
      let error = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        error += chunk.toString();
      });
      try {
        await vi.waitFor(
          () => expect(output).toBe(`opencode-stats 0.2.0 · ${origin}\nPress Ctrl+C to stop.\n`),
          { timeout: 10000 },
        );
        const response = await fetch(`${origin}/api/browser-copy`);
        expect(response.headers.get("content-type")).toBe("application/octet-stream");
        const copy = decode(await response.arrayBuffer());
        expect(Array.from(copy.steps.start)).toEqual([1234567890000]);
        expect(Array.from(copy.steps.input)).toEqual([1]);
        expect(Array.from(copy.steps.reasoning)).toEqual([5]);
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          const failures: string[] = [];
          page.on("pageerror", (failure) => {
            failures.push(failure.message);
          });
          await page.goto(origin);
          await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
          expect(await page.title()).toBe("Overview · opencode-stats");
          expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
          expect(await page.getByRole("navigation").count()).toBe(1);
          expect(failures).toEqual([]);
        } finally {
          await browser.close();
        }
        if (process.platform === "win32") child.kill("SIGINT");
        else {
          if (!child.pid) throw new Error("Bin has no process group");
          process.kill(-child.pid, "SIGINT");
        }
        expect(await exit).toEqual([0, null]);
        expect(output).toBe(`opencode-stats 0.2.0 · ${origin}\nPress Ctrl+C to stop.\nStopped.\n`);
        expect(error).toBe("");
        await expect(fetch(origin)).rejects.toThrow("fetch failed");
      } finally {
        child.kill();
        await exit;
      }
    } finally {
      writer?.close();
      await rm(folder, { recursive: true, force: true });
    }
  });
  it("checks real bundles and rejects planted forbidden imports and bin dependencies", async () => {
    expect(execFileSync("bun", ["run", "scripts/bundle-check.ts"], { encoding: "utf8" })).toBe(
      "Bundle imports checked.\n",
    );
    const folder = await mkdtemp(join(tmpdir(), "stats-bundle-canary-"));
    await mkdir(join(folder, "metafiles"));
    const meta = join(folder, "metafiles");
    const baseline = {
      inputs: { "fixture.ts": { imports: [] } },
      outputs: {
        "bundle.js": {
          imports: [{ path: "node:fs", external: true }],
          inputs: { "fixture.ts": { bytesInOutput: 1 } },
        },
      },
    };
    const check = () =>
      execFileSync("bun", ["run", "scripts/bundle-check.ts", meta], {
        encoding: "utf8",
        stdio: "pipe",
      });
    try {
      await writeFile(join(meta, "bin.json"), JSON.stringify(baseline));
      await writeFile(join(meta, "process.json"), JSON.stringify(baseline));
      await writeFile(join(meta, "sync-worker.json"), JSON.stringify(baseline));
      expect(check()).toBe("Bundle imports checked.\n");
      const unusedBarrel = {
        inputs: { "fixture.ts": { imports: [{ path: "./query-effect.js", external: true }] } },
        outputs: { "bundle.js": { imports: [], inputs: { "fixture.ts": { bytesInOutput: 0 } } } },
      };
      await writeFile(join(meta, "sync-worker.json"), JSON.stringify(unusedBarrel));
      expect(check()).toBe("Bundle imports checked.\n");
      await writeFile(
        join(meta, "sync-worker.json"),
        JSON.stringify({
          ...unusedBarrel,
          outputs: {
            "bundle.js": {
              imports: [{ path: "./query-effect.js", external: true }],
              inputs: { "fixture.ts": { bytesInOutput: 0 } },
            },
          },
        }),
      );
      expect(check).toThrow("Forbidden external import: ./query-effect.js");
      await writeFile(
        join(meta, "sync-worker.json"),
        JSON.stringify({
          ...unusedBarrel,
          outputs: { "bundle.js": { imports: [], inputs: { "fixture.ts": { bytesInOutput: 1 } } } },
        }),
      );
      expect(check).toThrow("Forbidden external import: ./query-effect.js");
      await writeFile(join(meta, "sync-worker.json"), JSON.stringify(baseline));
      for (const path of ["unbundled-package", "bun:invented", "./leftover.js"]) {
        await writeFile(
          join(meta, "process.json"),
          JSON.stringify({
            ...baseline,
            outputs: {
              "bundle.js": {
                ...baseline.outputs["bundle.js"],
                imports: [{ path, external: true }],
              },
            },
          }),
        );
        expect(check).toThrow(`Forbidden external import: ${path}`);
      }
      await writeFile(join(meta, "process.json"), JSON.stringify(baseline));
      for (const path of [
        "node_modules/effect/Effect.js",
        "node_modules/@effect/platform/index.js",
        "node_modules/drizzle-orm/index.js",
      ]) {
        await writeFile(
          join(meta, "bin.json"),
          JSON.stringify({ ...baseline, inputs: { [path]: { imports: [] } } }),
        );
        expect(check).toThrow("Bin bundle contains Effect or drizzle");
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
