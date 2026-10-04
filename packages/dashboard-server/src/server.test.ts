import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeServer } from "./http.node.ts";
import { startServer } from "./server.ts";
import { httpRequest } from "./testing/request.ts";

let files: string;
beforeAll(async () => {
  files = await mkdtemp(join(tmpdir(), "dashboard-server-"));
  await mkdir(join(files, "assets"));
  await mkdir(join(files, "assets/nested"));
  await mkdir(join(files, "assets/nested/assets"));
  await writeFile(join(files, "assets/nested/assets/private.js"), "Synthetic nested asset");
  await writeFile(join(files, "assets/nested/index.html"), "Synthetic private fixture");
  await writeFile(join(files, "index.html"), "<!doctype html><title>Synthetic dashboard</title>");
  await writeFile(join(files, "assets/dashboard-a1b2c3.js"), "document.title = 'Synthetic';");
});
afterAll(async () => {
  await rm(files, { recursive: true });
});

const withServer = (check: (origin: string) => Promise<void>): Promise<void> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const origin = yield* startServer(files);
        yield* Effect.promise(() => check(origin));
      }).pipe(Effect.provide(nodeServer(0))),
    ),
  );

describe("dashboard HTTP", () => {
  it("serves the dashboard skeleton and hashed files on IPv4 loopback", async () => {
    await withServer(async (origin) => {
      expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      for (const path of ["/", "/models?range=30", "/sessions"]) {
        const response = await fetch(`${origin}${path}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toBe("<!doctype html><title>Synthetic dashboard</title>");
      }
      const asset = await fetch(`${origin}/assets/dashboard-a1b2c3.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toContain("javascript");
      expect(await asset.text()).toBe("document.title = 'Synthetic';");
    });
  });
  it("isolates every response and never grants cross-origin reads", async () => {
    await withServer(async (origin) => {
      for (const path of ["/", "/assets/dashboard-a1b2c3.js", "/assets/missing.js"]) {
        const response = await fetch(`${origin}${path}`, {
          headers: { Origin: "https://foreign.test" },
        });
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
        expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
        expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
        expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("content-encoding")).toBeNull();
        await response.text();
      }
    });
  });
  it("rejects foreign hosts and unsafe writes before localhost redirects", async () => {
    await withServer(async (origin) => {
      const host = new URL(origin).host;
      const cases = [
        { method: "GET", headers: { Host: "foreign.test" }, status: 403 },
        { method: "GET", headers: { Host: "localhost:1" }, status: 403 },
        { method: "GET", headers: { Host: `${host}.foreign.test` }, status: 403 },
        { method: "GET", headers: { Host: host.replace("127.0.0.1", "localhost") }, status: 308 },
        { method: "POST", headers: { Origin: "https://foreign.test" }, status: 403 },
        { method: "OPTIONS", headers: { Origin: "https://foreign.test" }, status: 403 },
        { method: "DELETE", headers: {}, status: 403 },
        { method: "POST", headers: { Origin: origin }, status: 405 },
        { method: "HEAD", headers: {}, status: 200 },
        {
          method: "POST",
          headers: { Origin: origin, Host: host.replace("127.0.0.1", "localhost") },
          status: 308,
        },
        {
          method: "POST",
          headers: { Origin: "null", Host: host.replace("127.0.0.1", "localhost") },
          status: 403,
        },
      ];
      for (const { status, ...init } of cases) {
        const response = await httpRequest(`${origin}/models?range=30`, init);
        expect(response.status).toBe(status);
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("location")).toBe(
          status === 308 ? `${origin}/models?range=30` : null,
        );
        await response.text();
      }
    });
  });
  it("does not expose files outside flat assets or mistake API paths for pages", async () => {
    await withServer(async (origin) => {
      for (const path of [
        "/assets/missing.js",
        "/assets/%2e%2e%2findex.html",
        "/assets/nested/index.html",
        "/assets/nested/assets/private.js",
        "/api/missing",
      ]) {
        const response = await fetch(`${origin}${path}`);
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("");
      }
    });
  });
});
