import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { serverLog } from "./log.ts";

it("writes private key=value lines and detects the previous unclean run", () => {
  const folder = mkdtempSync(join(tmpdir(), "server-log-"));
  try {
    const log = serverLog(folder, () => new Date("2026-10-05T00:00:00Z"));
    log.write({
      event: "start",
      version: "1.3.0",
      platform: "darwin",
      runtime: "1.4.2",
      starter: "plugin",
      port: 22439,
    });
    log.write({ event: "database", database: join(process.env["HOME"]!, "a.db"), source: "flag" });
    log.write({ event: "database", database: process.env["HOME"]!, source: "default" });
    log.close();
    chmodSync(join(folder, "server.log"), 0o644);
    const next = serverLog(folder, () => new Date("2026-10-05T00:00:01Z"));
    next.close();
    const text = readFileSync(join(folder, "server.log"), "utf8");
    expect(text).toContain(
      'event=start version="1.3.0" platform="darwin" runtime="1.4.2" starter="plugin" port=22439',
    );
    expect(text).toContain('event=database database="~/a.db" source="flag"');
    expect(text).toContain('event=database database="~" source="default"');
    expect(text).toContain("event=previous.unclean");
    expect(statSync(join(folder, "server.log")).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(folder, { recursive: true });
  }
});

it("checks trimming hourly, leaves exactly 2 MiB alone, and discards an oversized incomplete line", () => {
  vi.useFakeTimers();
  const folder = mkdtempSync(join(tmpdir(), "server-hourly-log-"));
  const file = join(folder, "server.log");
  writeFileSync(file, "x".repeat(2 * 1024 * 1024));
  const log = serverLog(folder);
  try {
    expect(statSync(file).size).toBe(2 * 1024 * 1024);
    writeFileSync(file, "x".repeat(2 * 1024 * 1024 + 1));
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    expect(statSync(file).size).toBe(2 * 1024 * 1024 + 1);
    vi.advanceTimersByTime(1);
    expect(readFileSync(file, "utf8")).toBe("");
    log.write({ event: "conflict", kind: "port" });
    expect(readFileSync(file, "utf8")).toContain('event=conflict kind="port"');
  } finally {
    log.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    rmSync(folder, { recursive: true });
  }
});

it("trims over 2 MiB to complete newest lines within 1 MiB", () => {
  const folder = mkdtempSync(join(tmpdir(), "server-trim-"));
  try {
    const file = join(folder, "server.log");
    writeFileSync(file, "old\n".repeat(600000) + "event=stop\n");
    const log = serverLog(folder);
    log.close();
    const text = readFileSync(file, "utf8");
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1024 * 1024);
    expect(text).toMatch(/^old\n/u);
    expect(text.endsWith("event=stop\n")).toBe(true);
    expect(text).not.toContain("previous.unclean");
  } finally {
    rmSync(folder, { recursive: true });
  }
});

it("detects a killed run after trimming its start marker and does not mistake a path for a stop event", () => {
  const folder = mkdtempSync(join(tmpdir(), "trimmed-lifetime-"));
  try {
    writeFileSync(
      join(folder, "server.log"),
      'time=2026-10-05T00:00:00Z event=start\ntime=2026-10-05T00:00:01Z event=database database="~/event=stop.db"\n',
    );
    const first = serverLog(folder);
    first.close();
    expect(readFileSync(join(folder, "server.log"), "utf8")).toContain("event=previous.unclean");
    writeFileSync(join(folder, "server.log"), "older\n".repeat(500000));
    writeFileSync(join(folder, "server.json"), "synthetic stale owner");
    const next = serverLog(folder);
    next.close();
    expect(readFileSync(join(folder, "server.log"), "utf8")).toContain("event=previous.unclean");
  } finally {
    rmSync(folder, { recursive: true });
  }
});

it("a clean stop after a start is not reported as an unclean previous run", () => {
  const folder = mkdtempSync(join(tmpdir(), "clean-lifetime-"));
  try {
    writeFileSync(
      join(folder, "server.log"),
      "time=2026-10-05T00:00:00Z event=start\ntime=2026-10-05T00:00:01Z event=stop\n",
    );
    const log = serverLog(folder);
    log.close();
    expect(readFileSync(join(folder, "server.log"), "utf8")).not.toContain("previous.unclean");
  } finally {
    rmSync(folder, { recursive: true });
  }
});
