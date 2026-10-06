import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { displayPath } from "@opencode-stats/launcher";

type Lifetime = {
  readonly version: string;
  readonly platform: string;
  readonly runtime: string;
  readonly starter: "plugin" | "terminal";
  readonly port: number;
};
export type LogEvent =
  | ({ readonly event: "start" | "stop" } & Lifetime)
  | {
      readonly event: "database";
      readonly database: string;
      readonly source: "flag" | "plugin" | "environment" | "default";
    }
  | {
      readonly event: "build.start" | "build.end";
      readonly steps: number;
      readonly milliseconds: number;
      readonly sessions: number;
      readonly reason: "first" | "version" | "damaged" | "resume";
    }
  | {
      readonly event: "crash";
      readonly kind: string;
      readonly code: string;
      readonly statement: string;
      readonly frames: string;
    }
  | { readonly event: "conflict"; readonly kind: "database" | "port" }
  | { readonly event: "previous.unclean" };

export function serverLog(folder: string, now: () => Date = () => new Date()) {
  const file = join(folder, "server.log");
  closeSync(openSync(file, "a", 0o600));
  chmodSync(file, 0o600);
  const trim = (): void => {
    if (statSync(file).size <= 2 * 1024 * 1024) return;
    const bytes = readFileSync(file);
    const start = bytes.indexOf(10, bytes.length - 1024 * 1024);
    writeFileSync(file, bytes.subarray(start === -1 ? bytes.length : start + 1));
  };
  trim();
  const write = (event: LogEvent): void => {
    const fields = Object.entries(event).map(
      ([key, value]) =>
        `${key}=${key === "event" ? value : JSON.stringify(key === "database" ? displayPath(String(value)) : value)}`,
    );
    appendFileSync(file, `time=${now().toISOString()} ${fields.join(" ")}\n`);
  };
  const previous = readFileSync(file).toString();
  const lastLifetime = previous
    .split("\n")
    .map((line) => line.split(" ")[1])
    .findLast((event) => event === "event=start" || event === "event=stop");
  if (existsSync(join(folder, "server.json")) || lastLifetime === "event=start")
    write({ event: "previous.unclean" });
  const timer = setInterval(trim, 60 * 60 * 1000);
  return { write, close: () => clearInterval(timer) };
}
