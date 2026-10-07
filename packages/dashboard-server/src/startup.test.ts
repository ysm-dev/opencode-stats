import { createServer } from "node:http";
import * as os from "node:os";
import * as Effect from "effect/Effect";
import { describe, expect, it, vi } from "vitest";
import { nodeServer } from "./http.node.ts";
import { startServer } from "./server.ts";

vi.mock("node:os", { spy: true });

describe("dashboard startup", () => {
  it("reports other bind failures without leaking platform messages", async () => {
    await expect(
      Effect.runPromise(Effect.scoped(startServer("unused").pipe(Effect.provide(nodeServer(-1))))),
    ).rejects.toMatchObject({
      message: "Can't start: couldn't bind 127.0.0.1:-1.",
      code: "BIND_FAILED",
    });
  });
  it("reports a held port without binding a replacement", async () => {
    const held = createServer();
    await new Promise<void>((resolve) => held.listen(0, "127.0.0.1", resolve));
    const address = held.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    try {
      await expect(
        Effect.runPromise(
          Effect.scoped(startServer("unused").pipe(Effect.provide(nodeServer(address.port)))),
        ),
      ).rejects.toMatchObject({
        message: `Can't start: 127.0.0.1:${address.port} is in use by another program. Free it, or pass \`--port <n>\`.`,
      });
    } finally {
      await new Promise<void>((resolve) => held.close(() => resolve()));
    }
  });
  it("lowers the whole process to nice 10", async () => {
    const priority = vi.spyOn(os, "setPriority").mockImplementation(() => {});
    try {
      await Effect.runPromise(
        Effect.scoped(startServer("unused").pipe(Effect.provide(nodeServer(0)))),
      );
      expect(priority).toHaveBeenCalledExactlyOnceWith(0, 10);
    } finally {
      priority.mockRestore();
    }
  });
});
