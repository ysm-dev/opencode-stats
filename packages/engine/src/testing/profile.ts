import { Session } from "node:inspector/promises";
import { afterAll, beforeAll } from "vitest";

const session = new Session();
beforeAll(async () => {
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.start");
});
afterAll(async () => {
  const { profile } = await session.post("Profiler.stop");
  session.disconnect();
  const totals = new Map<string, number>();
  for (const node of profile.nodes) {
    const { functionName, url, lineNumber } = node.callFrame;
    const key = `${functionName} ${url}:${lineNumber + 1}`;
    totals.set(key, (totals.get(key) ?? 0) + (node.hitCount ?? 0));
  }
  process.stderr.write(
    `[DEBUG-engine-profile] ${JSON.stringify([...totals].sort((a, b) => b[1] - a[1]).slice(0, 25))}\n`,
  );
});
