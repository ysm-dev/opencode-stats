import { writeFile, readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, inject } from "vitest";
import { fixture } from "../testing/server.ts";
import { heldBrowser } from "../testing/held-browser.ts";
import { openBrowser } from "./browser.ts";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Stryker's Vitest runner provides this ID; its instrumented modules accept it through this environment variable.
declare module "vitest" {
  interface ProvidedContext {
    activeMutant: string | undefined;
  }
}

describe("browser opening", () => {
  it.each([
    { platform: "darwin", command: "open", prefix: [], delay: 0 },
    { platform: "linux", command: "xdg-open", prefix: [], delay: 0 },
    { platform: "linux", command: "xdg-open", prefix: [], delay: 1200 },
    {
      platform: "win32",
      command: "rundll32.exe",
      prefix: ["url.dll,FileProtocolHandler"],
      delay: 0,
    },
  ] as const)(
    "opens on $platform without a shell (completion delay $delay ms)",
    async ({ platform, command, prefix, delay }) => {
      const files = await fixture("");
      const record = join(files.folder, "opened.json");
      const exited = join(files.folder, "exit.json");
      await writeFile(
        join(files.folder, command),
        `#!${process.execPath}\nconst fs=require('node:fs'); process.on('exit',code=>{fs.writeFileSync(${JSON.stringify(`${exited}.tmp`)},JSON.stringify({code})); fs.renameSync(${JSON.stringify(`${exited}.tmp`)},${JSON.stringify(exited)});}); setTimeout(()=>{fs.writeSync(1,Buffer.alloc(1024*1024)); fs.writeSync(2,Buffer.alloc(1024*1024)); process.kill(-process.pid,0); fs.writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));},${delay});`,
        { mode: 0o700 },
      );
      // Observe completion, not spawn: an atomic exit marker also keeps cleanup behind all fixture writes.
      const observer = watch(files.folder, { encoding: "utf8" });
      const completed = new Promise<void>((resolve, reject) => {
        observer.once("error", reject);
        observer.on("change", (_event, name) => {
          if (name === "exit.json") resolve();
        });
      });
      try {
        await openBrowser("http://127.0.0.1:22439/?literal=hello&x=1", platform, {
          PATH: files.folder,
        });
        await completed;
        expect(JSON.parse(await readFile(exited, "utf8"))).toEqual({ code: 0 });
        expect(JSON.parse(await readFile(record, "utf8"))).toEqual([
          ...prefix,
          "http://127.0.0.1:22439/?literal=hello&x=1",
        ]);
      } finally {
        observer.close();
        await files.clean();
      }
    },
  );
  it("reports a missing OS opener", async () => {
    await expect(
      openBrowser("http://127.0.0.1:22439", "linux", { PATH: "/does-not-exist" }),
    ).rejects.toThrow("ENOENT");
  });
  it("lets the caller exit naturally while its browser remains alive", async ({
    onTestFinished,
  }) => {
    const local = await heldBrowser();
    onTestFinished(local.release);
    // Execute the same public call here so Stryker's per-test selection includes this subprocess probe.
    await openBrowser("http://127.0.0.1:22439", "linux", local.env);
    expect(await local.pid).toBeGreaterThan(0);
    const browser = await heldBrowser();
    onTestFinished(browser.release);
    const script = join(browser.folder, "caller.mjs");
    await writeFile(
      script,
      `import {openBrowser} from ${JSON.stringify(new URL("./browser.ts", import.meta.url).href)}; await openBrowser('http://127.0.0.1:22439','linux',process.env);`,
    );
    const caller = spawn(process.execPath, [script], {
      env: { ...process.env, ...browser.env, __STRYKER_ACTIVE_MUTANT__: inject("activeMutant") },
      stdio: "pipe",
    });
    const controller = new AbortController();
    const exit = once(caller, "exit", { signal: controller.signal });
    onTestFinished(() => {
      controller.abort();
      caller.kill();
    });
    const pid = await browser.pid;
    expect(await exit).toEqual([0, null]);
    expect(process.kill(pid, 0)).toBe(true);
  });
});
