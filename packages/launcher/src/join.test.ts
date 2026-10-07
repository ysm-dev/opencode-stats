import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import * as http from "node:http";
import { publishRecord, type ServerRecord } from "./record.ts";
import { answering, discover, joinMessage } from "./join.ts";
import { listen, closeServer } from "./testing/port.ts";
import { serverRecord } from "./testing/server.ts";
vi.mock("node:http", { spy: true });

it("joins only an authenticated matching real answer and leaves a different database alone", async () => {
  const folder = mkdtempSync(join(tmpdir(), "join-server-"));
  let answer: ServerRecord;
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${"a".repeat(64)}`) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("content-type", "application/json");
    expect(request.url).toBe(request.method === "POST" ? "/api/conflict" : "/api/server");
    response.end(JSON.stringify(answer));
  });
  const record = serverRecord(await listen(server), { starter: "terminal" });
  answer = record;
  publishRecord(folder, record);
  try {
    expect(await discover(folder, record.database, "2.0.0")).toEqual(record);
    await expect(discover(folder, "/synthetic/b.db", "2.0.0")).rejects.toThrow(
      `A dashboard server for \`/synthetic/a.db\` (from the running dashboard server's record) is already running (opencode-stats 1.3.0, started in a terminal, ${record.address}). opencode-stats serves one OpenCode database at a time.`,
    );
    answer = { ...record, pid: 456 };
    expect(await discover(folder, record.database, "2.0.0")).toBeUndefined();
  } finally {
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it("joins an explicitly symlinked database as the same source without replacing or reporting a conflict", async () => {
  const folder = mkdtempSync(join(tmpdir(), "database-alias-"));
  const database = join(realpathSync(folder), "actual.db");
  const alias = join(folder, "alias.db");
  writeFileSync(database, "synthetic source");
  symlinkSync(database, alias, "file");
  let record: ServerRecord;
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(String(request.url));
    response.end(JSON.stringify(record));
  });
  record = serverRecord(await listen(server), { starter: "terminal", database });
  publishRecord(folder, record);
  try {
    expect(realpathSync(alias)).not.toBe(alias);
    expect(await discover(folder, alias, "2.0.0")).toEqual(record);
    expect(paths).toEqual(["/api/server"]);
  } finally {
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it.each([
  ["1.2.9", "1.3.0", true],
  ["1.3.0", "1.3.0", false],
  ["1.4.0", "1.3.0", false],
  ["0.9.9", "1.0.0", true],
  ["1.3.0-dev", "1.3.0", true],
  ["1.3.1", "1.3.0", false],
  ["2.0.0", "1.0.0", false],
  ["1.0.0", "1.0.0-dev", false],
  ["1.0.0-alpha", "1.0.0-beta", true],
  ["1.0.0-beta", "1.0.0-alpha", false],
  ["1.0.0-beta", "1.0.0-beta.1", true],
  ["1.0.0-beta.1", "1.0.0-beta", false],
  ["1.0.0-beta.2", "1.0.0-beta.11", true],
  ["1.0.0-beta.11", "1.0.0-beta.2", false],
  ["1.0.0-1", "1.0.0-alpha", true],
  ["1.0.0-alpha", "1.0.0-1", false],
  ["1.0.0-beta.1", "1.0.0-beta.1", false],
  ["1.0.0-dev-old", "1.0.0-dev-new", false],
  ["1.0.0-A", "1.0.0-a", true],
  ["1.0.0-a", "1.0.0-A", false],
  ["1.0.0--a", "1.0.0-1", false],
  ["1.0.0-1", "1.0.0--a", true],
  ["1.0.0-a-b", "1.0.0-a0", true],
  ["1.0.0-a0", "1.0.0-a-b", false],
])("only replaces an older plugin release %s with %s", async (running, wanted, replace) => {
  const folder = mkdtempSync(join(tmpdir(), "replace-server-"));
  let record: ServerRecord;
  let stops = 0;
  const server = createServer((request, response) => {
    expect(request.headers.authorization).toBe(`Bearer ${record.secret}`);
    expect(request.headers["x-opencode-stats-protocol"]).toBe("1");
    expect(request.method).toBe(request.url === "/api/server" ? "GET" : "POST");
    expect(request.headers.origin).toBe(record.address);
    if (request.url === "/api/stop") {
      stops += 1;
      unlinkSync(join(folder, "server.json"));
      response.writeHead(204).end();
      response.once("finish", () => {
        server.closeAllConnections();
        server.close();
      });
    } else response.end(JSON.stringify(record));
  });
  record = serverRecord(await listen(server), { version: running });
  publishRecord(folder, record);
  try {
    const message = await discover(folder, "/synthetic/b.db", wanted).then(
      () => "unexpected match",
      (failure) => joinMessage(failure),
    );
    expect(message).toContain(`started by OpenCode, ${record.address}`);
    const found = await discover(folder, record.database, wanted);
    expect(found).toEqual(replace ? undefined : record);
    expect(stops).toBe(replace ? 1 : 0);
  } finally {
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it("discovery and its error formatter accept no record as no server and no native words as a decided message", async () => {
  const folder = mkdtempSync(join(tmpdir(), "no-server-"));
  try {
    expect(await answering(folder)).toBeUndefined();
    expect(await discover(folder, "/synthetic/a.db", "1.3.0")).toBeUndefined();
    expect(joinMessage(new Error("PRIVATE_NATIVE_TITLE"))).toBe(
      "Can't start: dashboard server unavailable.",
    );
  } finally {
    rmSync(folder, { recursive: true });
  }
});

it("bounds a refused or stalled replacement and rechecks a racing winner's database", async () => {
  const folder = mkdtempSync(join(tmpdir(), "stalled-replace-"));
  let record: ServerRecord;
  let refused = true;
  const server = createServer((request, response) => {
    if (request.url === "/api/stop") response.writeHead(refused ? 403 : 204).end();
    else response.end(JSON.stringify(record));
  });
  record = serverRecord(await listen(server), { version: "1.0.0" });
  publishRecord(folder, record);
  try {
    await expect(discover(folder, record.database, "1.3.0")).rejects.toThrow(
      "Can't start: dashboard server refused replacement.",
    );
    refused = false;
    let waits = 0;
    await expect(
      discover(folder, record.database, "1.3.0", async (milliseconds) => {
        expect(milliseconds).toBe(100);
        waits += 1;
      }),
    ).rejects.toThrow("Can't start: dashboard server did not stop for replacement.");
    expect(waits).toBe(100);
    await expect(
      discover(folder, record.database, "1.3.0", async () => {
        record = { ...record, secret: "b".repeat(64), database: "/synthetic/b.db" };
        publishRecord(folder, record);
      }),
    ).rejects.toThrow("opencode-stats serves one OpenCode database at a time.");
  } finally {
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it("does not trust a foreign, malformed, oversized or disconnected answer", async () => {
  const folder = mkdtempSync(join(tmpdir(), "invalid-server-answer-"));
  let body = "not-json";
  let status = 200;
  let streaming = false;
  const server = createServer((request, response) => {
    if (body === "timeout") {
      response.flushHeaders();
      return;
    }
    if (body === "truncated") {
      response.setHeader("Content-Length", "10000");
      response.setHeader("Connection", "close");
      response.end("{}");
      return;
    }
    if (body === "disconnect") {
      request.socket.destroy();
      return;
    }
    response.writeHead(status);
    if (streaming) response.write(body);
    else response.end(body);
  });
  publishRecord(folder, serverRecord(await listen(server), { starter: "terminal" }));
  const record = (await import("./record.ts")).readRecord(folder)!;
  try {
    expect(await answering(folder)).toBeUndefined();
    status = 403;
    expect(await answering(folder)).toBeUndefined();
    status = 200;
    body = "x".repeat(40000);
    expect(await answering(folder)).toBeUndefined();
    body = JSON.stringify(record).padEnd(32 * 1024, " ");
    expect(await answering(folder)).toEqual(record);
    body += " ";
    streaming = true;
    const oversizedAt = Date.now();
    expect(await answering(folder)).toBeUndefined();
    expect(Date.now() - oversizedAt).toBeLessThan(500);
    const oversized = vi.mocked(http.request).mock.results.at(-1)!;
    if (oversized.type !== "return") throw new Error("No metadata request");
    expect(oversized.value.destroyed).toBe(true);
    streaming = false;
    expect(await answering(folder)).toBeUndefined();
    body = "disconnect";
    expect(await answering(folder)).toBeUndefined();
    body = "truncated";
    expect(await answering(folder)).toBeUndefined();
    body = "timeout";
    expect(await answering(folder)).toBeUndefined();
  } finally {
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it("replacement waits for the authenticated old listener even after its record is removed", async () => {
  const folder = mkdtempSync(join(tmpdir(), "replacement-close-"));
  let record: ServerRecord;
  const server = createServer((request, response) => {
    if (request.url === "/api/stop") {
      unlinkSync(join(folder, "server.json"));
      response.writeHead(204).end();
    } else response.end(JSON.stringify(record));
  });
  record = serverRecord(await listen(server), { version: "1.0.0" });
  publishRecord(folder, record);
  let waits = 0;
  try {
    expect(
      await discover(folder, record.database, "1.3.0", async () => {
        waits += 1;
        await closeServer(server);
      }),
    ).toBeUndefined();
    expect(waits).toBe(1);
  } finally {
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});
