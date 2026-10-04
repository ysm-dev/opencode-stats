import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { describe, expect, it, vi } from "vitest";
import { nodeServer } from "./http.node.ts";
import { program } from "./main.ts";

const unusedPort = async (): Promise<number> => {
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No address");
  await new Promise<void>((done) => socket.close(() => done()));
  return address.port;
};

const readWhenReady = async (url: string): Promise<Response> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((done) => setTimeout(done, 10));
    }
  }
  throw new Error("Dashboard server did not start");
};

describe("dashboard server program", () => {
  it("serves release-owned assets at the requested port until interrupted", async () => {
    const port = await unusedPort();
    const asset = `/assets/test-fixture-${randomUUID()}.js`;
    const file = resolve(`.release/package/dashboard${asset}`);
    await mkdir(resolve(".release/package/dashboard/assets"), { recursive: true });
    await writeFile(file, "synthetic-preview", { flag: "wx" });
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const fiber = Effect.runFork(Effect.scoped(program(["--port", String(port)], nodeServer)));
    try {
      const response = await readWhenReady(`http://127.0.0.1:${port}${asset}`);
      expect(response.status).toBe(200);
      expect(output).toHaveBeenCalledExactlyOnceWith("opencode-stats-ready\n");
      expect(await response.text()).toBe("synthetic-preview");
      const again = await fetch(`http://127.0.0.1:${port}${asset}`);
      expect(again.status).toBe(200);
      await again.text();
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber));
      await rm(file);
      output.mockRestore();
    }
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow("fetch failed");
  });
  it("rejects invalid flags before serving", async () => {
    await expect(
      Effect.runPromise(Effect.scoped(program(["--host", "0.0.0.0"], nodeServer))),
    ).rejects.toMatchObject({
      message: "Can't start: invalid dashboard server arguments. Use --port <n>.",
    });
  });
});
