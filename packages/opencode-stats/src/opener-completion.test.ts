import { createServer, type Socket } from "node:net";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { expect, it } from "vitest";
import { fixture, installOpener } from "../testing/server.ts";
import { openBrowser } from "./browser.ts";

it("opener completion waits for append and process exit, not controlled file creation", async () => {
  const files = await fixture("");
  let writer: Socket | undefined;
  let notify!: () => void;
  const created = new Promise<void>((done) => {
    notify = done;
  });
  const controller = createServer((socket) => {
    writer = socket;
    socket.once("data", notify);
  });
  await new Promise<void>((done) => controller.listen(0, "127.0.0.1", done));
  const address = controller.address();
  if (!address || typeof address === "string") throw new Error("No opener controller address");
  const opener = await installOpener(files.folder, address.port);
  const observer = watch(files.folder);
  let recordCreated!: () => void;
  let recordExited!: () => void;
  const creation = new Promise<void>((done) => {
    recordCreated = done;
  });
  const exit = new Promise<void>((done) => {
    recordExited = done;
  });
  observer.on("change", (_event, file) => {
    if (file === "opened") recordCreated();
    if (file === "opened.exit") recordExited();
  });
  const release = (): void => {
    writer?.end("append");
    writer = undefined;
  };
  try {
    await openBrowser("http://127.0.0.1:22439", process.platform, { PATH: files.folder });
    await created;
    await creation;
    expect(await readFile(opener.record, "utf8")).toBe("");
    expect(
      await Promise.race([
        opener.completed.then(() => "completed"),
        setImmediate().then(() => "writing"),
      ]),
    ).toBe("writing");
    release();
    await opener.completed;
    expect(await readFile(opener.record, "utf8")).toBe("http://127.0.0.1:22439\n");
    expect(JSON.parse(await readFile(opener.exited, "utf8"))).toEqual({ code: 0 });
  } finally {
    release();
    await exit;
    opener.close();
    observer.close();
    await new Promise<void>((done) => controller.close(() => done()));
    await files.clean();
  }
});
