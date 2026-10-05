import { request } from "node:http";
import { setTimeout } from "node:timers/promises";
import { displayPath, parseRecord, readRecord, type ServerRecord } from "./record.ts";
import { realpathSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

class JoinProblem extends Error {}

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: discovery failures expose only our own decided messages
export const joinMessage = (input: unknown): string =>
  input instanceof JoinProblem ? input.message : "Can't start: dashboard server unavailable.";

export const starterLabel = (record: ServerRecord): string =>
  record.starter === "plugin" ? "by OpenCode" : "in a terminal";
export const conflictMessage = (record: ServerRecord): string =>
  `A dashboard server for \`${displayPath(record.database)}\` is already running (opencode-stats ${record.version}, started ${starterLabel(record)}, ${record.address}). opencode-stats serves one OpenCode database at a time.`;

const serverRequest = (
  record: ServerRecord,
  path: string,
  write = false,
): Promise<string | undefined> =>
  new Promise((resolve) => {
    const req = request(
      `${record.address}${path}`,
      {
        ...(write ? { method: "POST" } : {}),
        headers: {
          Authorization: `Bearer ${record.secret}`,
          Origin: record.address,
          "X-Opencode-Stats-Protocol": "1",
        },
      },
      (response) => {
        let body = "";
        const decoder = new StringDecoder();
        response.on("data", (chunk: Buffer) => {
          body += decoder.write(chunk);
          if (body.length > 32 * 1024) {
            resolve(undefined);
            req.destroy();
          }
        });
        response.on("end", () =>
          resolve(response.statusCode === 200 || response.statusCode === 204 ? body : undefined),
        );
        response.on("error", () => resolve(undefined));
      },
    );
    req.setTimeout(1000, () => req.destroy());
    req.on("error", () => resolve(undefined));
    req.end();
  });

export async function answering(folder: string): Promise<ServerRecord | undefined> {
  const record = readRecord(folder);
  if (!record) return undefined;
  return verify(record);
}

async function verify(record: ServerRecord): Promise<ServerRecord | undefined> {
  const body = await serverRequest(record, "/api/server");
  let confirmed: ServerRecord | undefined;
  try {
    const answer = parseRecord(JSON.parse(String(body)));
    if (JSON.stringify(answer) === JSON.stringify(record)) confirmed = record;
  } catch {
    /* A response is not an identity until it passes the record parser. */
  }
  return confirmed;
}

const newer = (wanted: string, running: string): boolean => {
  const a = wanted.split("-");
  const b = running.split("-");
  const numbersA = a[0]!.split(".");
  const numbersB = b[0]!.split(".");
  for (const [index, number] of numbersA.entries()) {
    const difference = Number(number) - Number(numbersB[index]);
    if (difference) return Math.sign(difference) === 1;
  }
  const qualifierA = a.slice(1).join("-");
  const qualifierB = b.slice(1).join("-");
  if (!qualifierB) return false;
  if (!qualifierA) return true;
  return newerQualifier(qualifierA.split("."), qualifierB.split("."));
};

const newerQualifier = (a: string[], b: string[]): boolean => {
  for (const [index, x] of a.entries()) {
    const y = b[index];
    if (x === y) continue;
    if (y === undefined) return true;
    const numericX = !Number.isNaN(Number(x));
    const numericY = !Number.isNaN(Number(y));
    if (numericX !== numericY) return numericY;
    return numericX
      ? Math.sign(Number(x) - Number(y)) === 1
      : Buffer.compare(Buffer.from(x), Buffer.from(y)) === 1;
  }
  return false;
};

export async function discover(
  folder: string,
  database: string,
  version: string,
  wait: (ms: number) => Promise<void> = setTimeout,
): Promise<ServerRecord | undefined> {
  const record = await answering(folder);
  if (!record) return undefined;
  let canonical = database;
  try {
    canonical = realpathSync(database);
  } catch {
    /* A running server remains joinable if its source disappears. */
  }
  if (record.database !== canonical) {
    await serverRequest(record, "/api/conflict", true);
    throw new JoinProblem(conflictMessage(record));
  }
  if (record.starter !== "plugin" || !newer(version, record.version)) return record;
  if ((await serverRequest(record, "/api/stop", true)) === undefined)
    throw new JoinProblem("Can't start: dashboard server refused replacement.");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = await answering(folder);
    if (!current && !(await verify(record))) return undefined;
    if (!current) {
      await wait(100);
      continue;
    }
    if (current.secret !== record.secret) return discover(folder, database, version, wait);
    await wait(100);
  }
  throw new JoinProblem("Can't start: dashboard server did not stop for replacement.");
}
