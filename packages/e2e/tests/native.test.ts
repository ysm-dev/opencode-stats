import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import sqlite from "../../../native/sqlite/manifest.json" with { type: "json" };

it("native release policy rejects stale upstream versions and changed source checksums through the public command", async () => {
  let version = "3.99.0";
  let hash = "0".repeat(64);
  const server = createServer((request, response) => {
    response.end(
      request.url === "/download.html"
        ? `PRODUCT,${version},2026/sqlite-amalgamation-3990000.zip,10,${hash}\n`
        : `SQLite Release ${version} On 2020-01-01`,
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No release fixture address");
  const command = () =>
    new Promise<{ status: number | null; output: string }>((resolve) => {
      const child = spawn("bun", ["run", "scripts/native-outdated.ts"], {
        env: {
          ...process.env,
          SQLITE_DOWNLOAD_PAGE_URL: `http://127.0.0.1:${address.port}/download.html`,
        },
      });
      let output = "";
      child.stdout.on("data", (bytes: Buffer) => {
        output += bytes.toString();
      });
      child.stderr.on("data", (bytes: Buffer) => {
        output += bytes.toString();
      });
      child.once("close", (status) => resolve({ status, output }));
    });
  try {
    const stale = await command();
    expect(stale.status).not.toBe(0);
    expect(stale.output).toContain("is stale");
    version = sqlite.version;
    const changed = await command();
    expect(changed.status).not.toBe(0);
    expect(changed.output).toContain("source checksum differs from upstream");
    hash = sqlite.source.sha3;
    expect((await command()).status).toBe(0);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});
