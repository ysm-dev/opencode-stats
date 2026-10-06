import { onTestFinished, expect } from "vitest";
import { syntheticCopy, inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import type { EngineAction, EngineState } from "../index.ts";
import { inThreadEngine, manualClock } from "./index.ts";

export type CompleteState = Extract<EngineState, { screen: "dashboard" }>;
export const rangeStep = (start: number, input = 1) => ({
  start,
  input,
  cacheRead: null,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
});
export function rangeFixture(
  steps: Parameters<typeof syntheticCopy>[0] = [],
  now = "2026-10-07T14:02:00Z",
  zone = "UTC",
  locale = "en-GB",
  metadata: Parameters<typeof syntheticCopy>[1] = {},
) {
  const clock = manualClock(Date.parse(now));
  let timeZone = zone;
  const server = inMemoryDashboardServer(syntheticCopy(steps, metadata));
  const engine = inThreadEngine(server.fetch, queueMicrotask, {
    ...clock,
    timeZone: () => timeZone,
    locale: () => locale,
  });
  const states: EngineState[] = [];
  engine.client.subscribe((state) => states.push(state));
  onTestFinished(async () => {
    await engine.dispose();
    await server.dispose();
  });
  const request = async (action: EngineAction): Promise<CompleteState> => {
    const result = await engine.client.request(action);
    expect(result.kind).toBe("paint");
    if (result.kind !== "paint" || result.state.screen !== "dashboard")
      throw new Error("Expected a complete range");
    return result.state;
  };
  return {
    clock,
    server,
    engine,
    states,
    request,
    setZone: (nextZone: string) => {
      timeZone = nextZone;
    },
  };
}
