import { writeFile, readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../testing/server.ts";
import { openBrowser } from "./browser.ts";

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
  it("does not keep its caller's event loop alive for a long-running browser", async () => {
    const files = await fixture("");
    const record = join(files.folder, "browser-pid");
    await writeFile(
      join(files.folder, "xdg-open"),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(record)},String(process.pid)); setInterval(()=>{},1000);`,
      { mode: 0o700 },
    );
    const before = process.getActiveResourcesInfo().filter((name) => name === "ProcessWrap");
    let pid = 0;
    try {
      await openBrowser("http://127.0.0.1:22439", "linux", { PATH: files.folder });
      await vi.waitFor(
        async () => {
          pid = Number(await readFile(record, "utf8"));
          expect(pid).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );
      expect(process.getActiveResourcesInfo().filter((name) => name === "ProcessWrap")).toEqual(
        before,
      );
    } finally {
      if (pid > 0) process.kill(pid, "SIGTERM");
      await files.clean();
    }
  });
});
