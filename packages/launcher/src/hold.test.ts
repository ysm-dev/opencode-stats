import { createServer, type ServerResponse } from "node:http";
import * as http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { publishRecord } from "./record.ts";
import { holdServer } from "./hold.ts";
import { listen, closeServer } from "./testing/port.ts";
import { serverRecord } from "./testing/server.ts";

vi.mock("node:http", { spy: true });

it("shares exactly one authenticated hold across activations and releases it only after the last cleanup", async () => {
  const folder = mkdtempSync(join(tmpdir(), "holder-"));
  let connections = 0;
  let closed!: () => void;
  const released = new Promise<void>((done) => {
    closed = done;
  });
  let record: Parameters<typeof publishRecord>[1];
  const server = createServer((request, response) => {
    expect(request.headers.authorization).toBe(`Bearer ${record.secret}`);
    expect(request.headers["x-opencode-stats-protocol"]).toBe("1");
    if (request.url === "/api/server") {
      response.end(JSON.stringify(record));
      return;
    }
    connections += 1;
    response.write("opencode-stats-hold/1\n");
    request.on("close", closed);
  });
  const port = await listen(server);
  record = serverRecord(port);
  publishRecord(join(folder, "opencode-stats"), record);
  const options = {
    executable: "unused",
    script: "unused",
    port,
    env: { XDG_STATE_HOME: folder },
    db: record.database,
    version: record.version,
  };
  const first = holdServer(options);
  vi.resetModules();
  const reloaded = await import("./hold.ts");
  const second = reloaded.holdServer(options);
  try {
    expect(await first.ready).toEqual(record);
    const request = vi.mocked(http.request).mock.results.at(-1)!;
    if (request.type !== "return") throw new Error("No hold request");
    expect(request.value.socket?.timeout).toBe(0);
    expect(await second.ready).toEqual(record);
    expect(() => holdServer({ ...options, db: "/synthetic/b.db" })).toThrow(
      "One OpenCode process cannot hold two OpenCode databases.",
    );
    expect(connections).toBe(1);
    first.release();
    first.release();
    const third = holdServer(options);
    expect(await third.ready).toEqual(record);
    expect(connections).toBe(1);
    second.release();
    third.release();
    await released;
    expect(
      await Promise.race([third.closed.then(() => true), setImmediate().then(() => false)]),
    ).toBe(true);
    const restarted = holdServer(options);
    expect(await restarted.ready).toEqual(record);
    expect(connections).toBe(2);
    restarted.release();
    await restarted.closed;
  } finally {
    first.release();
    second.release();
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it.each([
  { status: 200, body: "x".repeat(22) },
  { status: 503, body: "opencode-stats-hold/1\n" },
  { status: 0, body: "" },
])("refuses a malformed or disconnected hold, status=$status", async ({ status, body }) => {
  const folder = mkdtempSync(join(tmpdir(), "invalid-holder-"));
  let record: Parameters<typeof publishRecord>[1];
  const server = createServer((request, response) => {
    if (request.url === "/api/server") {
      response.end(JSON.stringify(record));
      return;
    }
    if (status === 0) {
      request.socket.destroy();
      return;
    }
    response.writeHead(status);
    response.write(body);
  });
  record = serverRecord(await listen(server));
  publishRecord(join(folder, "opencode-stats"), record);
  const started = Date.now();
  const hold = holdServer({
    executable: "unused",
    script: "unused",
    port: Number(new URL(record.address).port),
    version: "1.3.0",
    db: record.database,
    env: { XDG_STATE_HOME: folder },
    wait: async () => {
      throw new Error("stop synthetic scheduler");
    },
  });
  try {
    expect(
      await Promise.race([hold.ready.then(() => "accepted"), hold.closed.then(() => "refused")]),
    ).toBe("refused");
    expect(Date.now() - started).toBeLessThan(500);
  } finally {
    hold.release();
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it("a dropped hold retries with injected jitter/backoff, validates split handshakes, and cleans up a released holder", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reconnecting-holder-"));
  let record: Parameters<typeof publishRecord>[1];
  let response: ServerResponse;
  let invalid = false;
  let nextHold!: () => void;
  let observed = new Promise<void>((done) => {
    nextHold = done;
  });
  const delays: number[] = [];
  let advance!: () => void;
  let delayed!: () => void;
  let delayObserved = new Promise<void>((done) => {
    delayed = done;
  });
  const server = createServer((request, output) => {
    if (request.url === "/api/server") {
      output.end(JSON.stringify(record));
      return;
    }
    response = output;
    if (invalid) {
      output.statusCode = 503;
      output.write("not-opencode-stats-hold!!");
    } else {
      output.write("opencode-stats-");
      queueMicrotask(() => output.write("hold/1\n"));
    }
    nextHold();
  });
  const port = await listen(server);
  record = serverRecord(port);
  publishRecord(join(folder, "opencode-stats"), record);
  const hold = holdServer({
    executable: "unused",
    script: "unused",
    port,
    db: record.database,
    env: { XDG_STATE_HOME: folder },
    version: "1.3.0",
    random: () => 0.5,
    wait: (milliseconds, signal) => {
      delays.push(milliseconds);
      delayed();
      return new Promise<void>((done, reject) => {
        advance = done;
        signal.addEventListener("abort", () => reject(new Error("released")), { once: true });
      });
    },
  });
  try {
    expect(await hold.ready).toEqual(record);
    await observed;
    invalid = true;
    response!.destroy();
    await delayObserved;
    expect(delays).toEqual([625]);
    for (const expected of [1125, 2125, 4125, 8125, 16125, 30125, 30125]) {
      delayObserved = new Promise<void>((done) => {
        delayed = done;
      });
      advance();
      await delayObserved;
      expect(delays.at(-1)).toBe(expected);
    }
    invalid = false;
    observed = new Promise<void>((done) => {
      nextHold = done;
    });
    advance();
    await observed;
    hold.release();
  } finally {
    hold.release();
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});

it("an answering server that never acknowledges its hold cannot strand a holder forever", async () => {
  const folder = mkdtempSync(join(tmpdir(), "unacknowledged-holder-"));
  let record: Parameters<typeof publishRecord>[1];
  const server = createServer((request, response) => {
    if (request.url === "/api/server") response.end(JSON.stringify(record));
    else response.flushHeaders();
  });
  const port = await listen(server);
  record = serverRecord(port);
  publishRecord(join(folder, "opencode-stats"), record);
  let notify!: (delay: number) => void;
  const timedOut = new Promise<number>((done) => {
    notify = done;
  });
  const hold = holdServer({
    executable: "unused",
    script: "unused",
    port,
    db: record.database,
    version: record.version,
    env: { XDG_STATE_HOME: folder },
    random: () => 0,
    wait: async (milliseconds) => {
      notify(milliseconds);
      throw new Error("finish synthetic scheduler");
    },
  });
  try {
    expect(await timedOut).toBe(500);
    expect(
      await Promise.race([hold.closed.then(() => true), setImmediate().then(() => false)]),
    ).toBe(true);
  } finally {
    hold.release();
    await closeServer(server);
    rmSync(folder, { recursive: true });
  }
});
