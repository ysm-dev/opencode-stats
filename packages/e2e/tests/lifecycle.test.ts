import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "node:http";
import { expect, it, vi } from "vitest";
import { temporaryPort, listen, closeServer, serverRecord } from "@opencode-stats/launcher/testing";
import { syntheticDatabase } from "@opencode-stats/stats-store/testing";
import { parseRecord, publishRecord } from "@opencode-stats/launcher";
import { capture } from "./testing/process.ts";

const installed = () => {
  const folder = mkdtempSync(join(tmpdir(), "installed-lifecycle-"));
  writeFileSync(join(folder, "package.json"), '{"private":true}');
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      resolve(".release/opencode-stats-0.2.0.tgz"),
    ],
    { cwd: folder, shell: process.platform === "win32" },
  );
  const database = join(folder, "synthetic.db");
  syntheticDatabase(database).close();
  const env = {
    ...process.env,
    HOME: folder,
    XDG_STATE_HOME: folder,
    XDG_CACHE_HOME: folder,
    XDG_DATA_HOME: folder,
  };
  const script = join(folder, "node_modules/opencode-stats/bin.js");
  const record = () =>
    parseRecord(JSON.parse(readFileSync(join(folder, "opencode-stats/server.json"), "utf8")));
  const start = (port: number, plugin = false) => {
    const entry = plugin ? join(folder, "node_modules/opencode-stats/process.js") : script;
    const child = spawn(
      "bun",
      [
        "--no-env-file",
        "--no-install",
        entry,
        ...(plugin ? ["--starter", "plugin"] : ["--no-open"]),
        "--db",
        database,
        "--port",
        String(port),
      ],
      { env, cwd: folder },
    );
    return { child, ...capture(child) };
  };
  return { folder, start, record, clean: () => rmSync(folder, { recursive: true, force: true }) };
};

it("installed bin races converge on one lifetime-lock winner; SIGKILL releases it and records the unclean run", async () => {
  const fixture = installed();
  const children = await Promise.all([temporaryPort(), temporaryPort(), temporaryPort()]).then(
    (ports) => ports.map((port) => fixture.start(port)),
  );
  try {
    await vi.waitFor(
      () => {
        expect(
          children.filter((value) => value.transcript.output.includes("Press Ctrl+C to stop."))
            .length,
        ).toBe(1);
        expect(
          children.filter((value) =>
            value.transcript.output.includes("already running, started in a terminal"),
          ).length,
        ).toBe(2);
      },
      { timeout: 10000 },
    );
    const before = fixture.record();
    for (const value of children.filter((child) =>
      child.transcript.output.includes("already running"),
    )) {
      expect(await value.closed).toEqual([0, null]);
      expect(value.transcript.output).toContain(before.address);
      expect(value.transcript.output).toContain("Database: ~/synthetic.db (from `--db`)");
      expect(value.transcript.error).toBe("");
    }
    const conflict = fixture.start(await temporaryPort());
    children.push(conflict);
    expect(await conflict.closed).toEqual([0, null]);
    process.kill(before.pid, "SIGKILL");
    const winner = children.find((value) =>
      value.transcript.output.includes("Press Ctrl+C to stop."),
    )!;
    expect(await winner.closed).toEqual([1, null]);
    const replacement = fixture.start(await temporaryPort());
    children.push(replacement);
    await vi.waitFor(
      () => expect(replacement.transcript.output).toContain("Press Ctrl+C to stop."),
      { timeout: 10000 },
    );
    expect(fixture.record().pid).not.toBe(before.pid);
    expect(readFileSync(join(fixture.folder, "opencode-stats/server.log"), "utf8")).toContain(
      "event=previous.unclean",
    );
    replacement.child.kill("SIGINT");
    expect(await replacement.closed).toEqual([0, null]);
  } finally {
    for (const value of children) value.child.kill("SIGINT");
    await Promise.all(children.map((value) => value.closed));
    fixture.clean();
  }
});

it("installed newer bin replaces an older plugin peer through the stable authenticated stop protocol", async () => {
  const fixture = installed();
  let old: ReturnType<typeof serverRecord>;
  let stops = 0;
  const peer = createServer((incoming, response) => {
    expect(incoming.headers.authorization).toBe(`Bearer ${old.secret}`);
    expect(incoming.headers["x-opencode-stats-protocol"]).toBe("1");
    if (incoming.url === "/api/stop") {
      stops += 1;
      unlinkSync(join(fixture.folder, "opencode-stats/server.json"));
      response.once("finish", () => {
        peer.closeAllConnections();
        peer.close();
      });
      response.writeHead(204).end();
    } else response.end(JSON.stringify(old));
  });
  old = serverRecord(await listen(peer), {
    version: "0.1.0",
    database: realpathSync(join(fixture.folder, "synthetic.db")),
  });
  publishRecord(join(fixture.folder, "opencode-stats"), old);
  const current = fixture.start(Number(new URL(old.address).port));
  try {
    await vi.waitFor(() => expect(current.transcript.output).toContain("Press Ctrl+C to stop."), {
      timeout: 10000,
    });
    expect(stops).toBe(1);
    expect(fixture.record()).toMatchObject({
      address: old.address,
      version: "0.2.0",
      starter: "terminal",
    });
    expect(fixture.record().secret).not.toBe(old.secret);
    expect(current.transcript.error).toBe("");
    current.child.kill("SIGINT");
    expect(await current.closed).toEqual([0, null]);
  } finally {
    current.child.kill("SIGINT");
    await current.closed;
    await closeServer(peer);
    fixture.clean();
  }
});

it("installed plugin server refuses unauthenticated holds/stops, remains held, then exits after its last TCP hold closes", async () => {
  const fixture = installed();
  const server = fixture.start(await temporaryPort(), true);
  const holds: ReturnType<typeof request>[] = [];
  try {
    await vi.waitFor(() => expect(server.transcript.output).toContain("opencode-stats-ready"), {
      timeout: 10000,
    });
    const record = fixture.record();
    for (const path of ["hold", "stop"]) {
      const response = await fetch(`${record.address}/api/${path}`, {
        method: path === "stop" ? "POST" : "GET",
        headers: { Origin: record.address },
      });
      expect(response.status).toBe(403);
    }
    await Promise.all(
      [1, 2].map(
        () =>
          new Promise<void>((done) => {
            const hold = request(
              `${record.address}/api/hold`,
              {
                headers: {
                  Authorization: `Bearer ${record.secret}`,
                  "X-Opencode-Stats-Protocol": "1",
                },
              },
              (response) => {
                response.once("data", (bytes: Buffer) => {
                  expect(bytes.toString()).toBe("opencode-stats-hold/1\n");
                  done();
                });
              },
            );
            hold.on("error", () => {
              /* destruction is intentional cleanup */
            });
            holds.push(hold);
            hold.end();
          }),
      ),
    );
    const joined = fixture.start(await temporaryPort());
    expect(await joined.closed).toEqual([0, null]);
    expect(joined.transcript.output).toContain("already running, started by OpenCode");
    expect(fixture.record().pid).toBe(record.pid);
    holds[0]!.destroy();
    await vi.waitFor(async () => {
      const response = await fetch(`${record.address}/api/server`, {
        headers: { Authorization: `Bearer ${record.secret}`, "X-Opencode-Stats-Protocol": "1" },
      });
      expect(await response.json()).toMatchObject({ holders: 1 });
    });
    const releasedAt = Date.now();
    holds[1]!.destroy();
    expect(await server.closed).toEqual([0, null]);
    expect(Date.now() - releasedAt).toBeGreaterThanOrEqual(9000);
    expect(Date.now() - releasedAt).toBeLessThan(20000);
    expect(server.transcript.error).toBe("");
  } finally {
    holds.forEach((hold) => hold.destroy());
    server.child.kill("SIGINT");
    await server.closed;
    fixture.clean();
  }
});
