import { describe, expect, it } from "bun:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { bunServer } from "./http.bun.ts";
import { startServer } from "./server.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Bun HTTP contract", () => {
  it("serves static bytes through Bun's real file adapter and releases the port", async () => {
    const folder = await mkdtemp(join(tmpdir(), "dashboard-contract-"));
    await mkdir(join(folder, "assets"));
    await writeFile(join(folder, "assets/dashboard-a1b2.js"), "synthetic-bun-asset");
    let address = "";
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            address = yield* startServer(folder);
            const asset = yield* Effect.promise(() => fetch(`${address}/assets/dashboard-a1b2.js`));
            expect(asset.status).toBe(200);
            expect(asset.headers.get("content-type")).toContain("javascript");
            expect(asset.headers.get("cross-origin-resource-policy")).toBe("same-origin");
            expect(yield* Effect.promise(() => asset.text())).toBe("synthetic-bun-asset");
            const port = Number(new URL(address).port);
            const failure = yield* Effect.exit(
              Effect.scoped(startServer(folder).pipe(Effect.provide(bunServer(port)))),
            );
            expect(Exit.isFailure(failure)).toBe(true);
          }).pipe(Effect.provide(bunServer(0))),
        ),
      );
      const stopped = await fetch(address).catch(() => null);
      expect(stopped).toBeNull();
    } finally {
      await rm(folder, { recursive: true });
    }
  });
  it("listens only on IPv4 loopback and serves the real dashboard files", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const origin = yield* startServer(new URL("../../dashboard/", import.meta.url).pathname);
          expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
          const response = yield* Effect.promise(() => fetch(`${origin}/models`));
          expect(response.status).toBe(200);
          expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
          const html = yield* Effect.promise(() => response.text());
          expect(html).toContain("<title>opencode-stats</title>");
        }).pipe(Effect.provide(bunServer(0))),
      ),
    );
  });
});
