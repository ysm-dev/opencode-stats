import { createServer } from "node:net";
import type { Socket } from "node:net";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./server.ts";

// The browser's only lifetime control is this test-owned connection. No timer can release it.
export const heldBrowser = async () => {
  const files = await fixture("");
  let connected: Socket | undefined;
  let ready!: (pid: number) => void;
  let failed!: (error: Error) => void;
  const pid = new Promise<number>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const server = createServer((socket) => {
    connected = socket;
    let message = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      message += chunk;
      if (!message.endsWith("\n")) return;
      const value = Number(message.trim());
      if (!Number.isSafeInteger(value) || value <= 0) failed(new Error("Invalid fixture PID"));
      else ready(value);
    });
    socket.on("error", failed);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No controller address");
  await writeFile(
    join(files.folder, "xdg-open"),
    `#!${process.execPath}\nconst socket=require('node:net').connect(${address.port},'127.0.0.1'); socket.on('connect',()=>socket.write(String(process.pid)+'\\n')); socket.on('data',()=>socket.end());`,
    { mode: 0o700 },
  );
  return {
    folder: files.folder,
    env: { PATH: files.folder },
    pid,
    release: async (): Promise<void> => {
      connected?.end("release");
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await files.clean();
    },
  };
};
