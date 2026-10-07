import { expect } from "vitest";
import type { StoreCopy, StoreEvent, StoreRuntime } from "../store.ts";
import type { StoreOptions } from "../location.ts";
import { readBuilt } from "./store.ts";

export const readSourceStopped = async (
  options: StoreOptions,
  runtime: StoreRuntime,
  announce: (copy: StoreCopy) => void = () => {},
) => {
  const reports: StoreEvent[] = [];
  const copy = await readBuilt(options, announce, runtime, (event) => reports.push(event));
  expect(reports.filter((event) => event.kind === "sync.stopped")).toEqual([
    expect.objectContaining({ reason: "source.unreadable", code: "unavailable" }),
  ]);
  expect(JSON.stringify(reports)).not.toMatch(
    /SYNTHETIC PRIVATE|SYNTHETIC SECRET|Failed query|params:/u,
  );
  return copy;
};
