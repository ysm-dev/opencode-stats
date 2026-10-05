import { expect, it } from "vitest";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { nodeRuntime } from "./runtime.node.ts";
import type { StoreCopy } from "./store.ts";

it("commits newest build units before an interruption and resumes without rereading unchanged units", async () => {
  const fixture = syntheticFixture();
  const { writer, source, folder } = fixture;
  writer.session("ses-new");
  writer.session("ses-old");
  writer.message({ id: "msg-new", session: "ses-new", seq: 0, start: 2000, tokens: { output: 2 } });
  writer.message({
    id: "msg-old",
    session: "ses-old",
    seq: 0,
    start: 1000,
    tokens: { output: -1 },
  });
  const committed: StoreCopy[] = [];
  try {
    await expect(
      readBuilt({ source, cacheHome: folder }, (copy) => committed.push(copy), nodeRuntime),
    ).rejects.toThrow("Stats store build failed.");
    expect(committed).toHaveLength(1);
    expect(committed[0]!.steps[0]!.output).toBe(2);
    expect(committed[0]!.historyCompleteFrom).toBe(1000);
    writer.rewriteWithoutCounter("msg-new", "SYNTHETIC INVALID JSON: must not be reread");
    writer.message({
      id: "msg-old",
      session: "ses-old",
      seq: 0,
      start: 1000,
      tokens: { output: 3 },
    });
    const resumed = await readBuilt({ source, cacheHome: folder }, () => {}, nodeRuntime);
    expect(resumed.generation).toBe(committed[0]!.generation);
    expect(resumed.revision).toBe(2);
    expect(resumed.steps.map((step) => step.output)).toEqual([2, 3]);
    expect(resumed.historyCompleteFrom).toBe(1000);
  } finally {
    fixture.dispose();
  }
});
