import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { stopProcess } from "./testing/index.ts";

it.each([false, true])(
  "cleanup finishes for an orphaned process (ignores SIGTERM: %s)",
  async (ignoreTerm) => {
    const parent = spawn(process.execPath, [
      "--input-type=module",
      "-e",
      `import {spawn} from 'node:child_process';
const child = spawn(process.execPath, ['-e', ${JSON.stringify("setInterval(() => {}, 1000);")} + ${JSON.stringify(ignoreTerm ? "process.on('SIGTERM', () => {});" : "")} + "process.send('ready');"], {detached:true,stdio:['ignore','ignore','ignore','ipc']});
child.once('message', () => { console.log(child.pid); child.disconnect(); child.unref(); });`,
    ]);
    let output = "";
    parent.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    await once(parent, "close");
    const pid = Number(output.trim());
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
    try {
      await expect(stopProcess(pid)).resolves.toBeUndefined();
    } finally {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* The owned detached fixture already exited. */
      }
    }
  },
);

it("cleanup accepts an already reaped owned process", async () => {
  const child = spawn(process.execPath, ["-e", ""]);
  await once(child, "close");
  await expect(stopProcess(child.pid!)).resolves.toBeUndefined();
});
