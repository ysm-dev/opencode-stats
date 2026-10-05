import { request } from "node:http";
import { setTimeout } from "node:timers/promises";
import { start, type StartOptions } from "./start.ts";
import { discover } from "./join.ts";
import { stateFolder, type ServerRecord } from "./record.ts";

type HoldOptions = StartOptions & {
  db: string;
  version: string;
  random?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};
const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  setTimeout(ms, undefined, { signal });

export async function startOrJoin(
  options: HoldOptions,
  signal: AbortSignal,
): Promise<ServerRecord> {
  const folder = stateFolder(options.env);
  const current = await discover(folder, options.db, options.version);
  if (current) return current;
  const child = start({ ...options, detached: true });
  let failed = false;
  child.once("error", () => {
    failed = true;
  });
  child.once("exit", (code) => {
    failed = code !== 0;
  });
  child.unref();
  for (let remaining = 100; remaining !== 0 && !signal.aborted; remaining -= 1) {
    const record = await discover(folder, options.db, options.version);
    if (record) return record;
    if (failed) throw new Error("Can't start: dashboard server stopped.");
    await (options.wait ?? wait)(100, signal);
  }
  throw new Error("Can't start: dashboard server did not answer.");
}

const connection = (
  record: ServerRecord,
  signal: AbortSignal,
  ready: (record: ServerRecord) => void,
): Promise<void> =>
  new Promise((done) => {
    const req = request(
      `${record.address}/api/hold`,
      {
        signal,
        headers: { Authorization: `Bearer ${record.secret}`, "X-Opencode-Stats-Protocol": "1" },
      },
      (response) => {
        let handshake = "";
        response.on("data", (chunk: Buffer) => {
          handshake += chunk.toString();
          if (response.statusCode === 200 && handshake === "opencode-stats-hold/1\n") {
            req.setTimeout(0);
            ready(record);
          } else if (handshake.length >= 22) req.destroy();
        });
        response.on("close", done);
      },
    );
    req.setTimeout(1000, () => req.destroy());
    req.on("error", done);
    req.end();
  });

type Holder = {
  readonly database: string;
  readonly controller: AbortController;
  readonly ready: Promise<ServerRecord>;
  readonly closed: Promise<void>;
  count: number;
};
declare global {
  var opencodeStatsHoldersV1: Map<string, Holder> | undefined;
}
// Plugin reloads and different installed releases in one OpenCode process share one holder.
const holders = (globalThis.opencodeStatsHoldersV1 ??= new Map<string, Holder>());

export function holdServer(options: HoldOptions): {
  ready: Promise<ServerRecord>;
  closed: Promise<void>;
  release: () => void;
} {
  const key = stateFolder(options.env);
  let holder = holders.get(key);
  if (holder && holder.database !== options.db)
    throw new Error("One OpenCode process cannot hold two OpenCode databases.");
  if (!holder) {
    const controller = new AbortController();
    let notify!: (record: ServerRecord) => void;
    const ready = new Promise<ServerRecord>((done) => {
      notify = done;
    });
    let finish!: () => void;
    const closed = new Promise<void>((done) => {
      finish = done;
    });
    holder = { database: options.db, controller, ready, closed, count: 0 };
    holders.set(key, holder);
    void (async () => {
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          const record = await startOrJoin(options, controller.signal);
          await connection(record, controller.signal, (value) => {
            failures = 0;
            notify(value);
          });
        } catch {
          /* Library failures never escape into OpenCode or diagnostics. */
        }
        failures += 1;
        try {
          await (options.wait ?? wait)(
            Math.min(30000, 250 * 2 ** Math.min(failures, 7)) +
              (options.random ?? Math.random)() * 250,
            controller.signal,
          );
        } catch {
          break;
        }
      }
    })().then(finish, finish);
  }
  const shared = holder;
  shared.count += 1;
  let released = false;
  return {
    ready: shared.ready,
    closed: shared.closed,
    release: () => {
      if (released) return;
      released = true;
      shared.count -= 1;
      if (shared.count === 0) {
        holders.delete(key);
        shared.controller.abort();
      }
    },
  };
}
