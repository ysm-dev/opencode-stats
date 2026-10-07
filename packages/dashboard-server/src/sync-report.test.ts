import { expect, it, vi } from "vitest";
import { syntheticStop } from "@opencode-stats/browser-copy/testing";
import { syncReport } from "./sync-report.ts";

it("formats lock times for the terminal and keeps consistency diagnostics in the log only", () => {
  const stop = syntheticStop("source.locked", {
    code: "locked",
    lockedSince: new Date(2026, 9, 7, 14, 2).getTime(),
  });
  const log = vi.fn<Parameters<typeof syncReport>[0]["log"]>();
  const status = vi.fn<Parameters<typeof syncReport>[0]["status"]>();
  const output = vi.fn<(line: string) => void>();
  const error = vi.fn<(line: string) => void>();
  const report = syncReport({
    params: stop.params,
    log,
    status,
    output,
    error,
    color: false,
    now: () => new Date(2026, 9, 7, 14, 41, 3),
  });
  const problem = {
    reason: stop.reason,
    code: stop.params.code,
    since: stop.since,
    lockedSince: stop.params.lockedSince,
  };
  report({ kind: "sync.stopped", ...problem });
  const difference = {
    session: "synthetic-session",
    expectedCount: 1,
    actualCount: 2,
    expectedPosition: 0,
    actualPosition: 1,
  };
  report({ kind: "consistency.difference", ...difference });
  expect(status).toHaveBeenCalledExactlyOnceWith(stop);
  expect(error).toHaveBeenCalledExactlyOnceWith(
    "14:41:03  Not updating: OpenCode's database has been locked since 14:02\n",
  );
  expect(output).not.toHaveBeenCalled();
  expect(log).toHaveBeenLastCalledWith({ event: "consistency.difference", ...difference });
  report({ kind: "sync.resumed", ...problem });
  expect(status).toHaveBeenLastCalledWith(null);
  expect(error).toHaveBeenLastCalledWith("14:41:03  Up to date again.\n");
});
