import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../testing/server.ts";
import { openBrowser } from "./browser.ts";

describe("browser opening", () => {
  it.each([
    ["darwin", "open", []],
    ["linux", "xdg-open", []],
    ["win32", "rundll32.exe", ["url.dll,FileProtocolHandler"]],
  ] as const)("opens on %s without a shell", async (platform, command, prefix) => {
    const files = await fixture("");
    const record = join(files.folder, "opened.json");
    await writeFile(
      join(files.folder, command),
      `#!${process.execPath}\nconst fs=require('node:fs'); fs.writeSync(1,Buffer.alloc(1024*1024)); fs.writeSync(2,Buffer.alloc(1024*1024)); process.kill(-process.pid,0); fs.writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));`,
      { mode: 0o700 },
    );
    try {
      await openBrowser("http://127.0.0.1:22439/?literal=hello&x=1", platform, {
        PATH: files.folder,
      });
      await vi.waitFor(async () =>
        expect(JSON.parse(await readFile(record, "utf8"))).toEqual([
          ...prefix,
          "http://127.0.0.1:22439/?literal=hello&x=1",
        ]),
      );
    } finally {
      await files.clean();
    }
  });
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
