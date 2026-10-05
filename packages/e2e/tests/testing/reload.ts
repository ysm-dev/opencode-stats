import type { Browser } from "playwright";
import { decode, type BrowserCopy } from "@opencode-stats/browser-copy";
import type { syntheticDatabase, SyntheticMessage } from "@opencode-stats/stats-store/testing";
import { expect, vi } from "vitest";

export const installedStep: SyntheticMessage = {
  id: "msg-installed",
  session: "ses-installed",
  seq: 0,
  start: 1234567890000,
  tokens: { input: 1, cache: { read: 2, write: 3 }, output: 4, reasoning: 5 },
};

export async function checkReload(
  browser: Browser,
  origin: string,
  first: BrowserCopy,
  writer: ReturnType<typeof syntheticDatabase>,
) {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.getByRole("region", { name: "Tokens" }).getByText("15", { exact: true }).waitFor();
    writer.message({
      id: "msg-installed",
      session: "ses-installed",
      seq: 0,
      start: 1234567890000,
      tokens: { input: 10, output: 20 },
    });
    await vi.waitFor(
      async () => {
        const changed = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
        expect(Array.from(changed.steps.input)).toEqual([10]);
        expect(Array.from(changed.steps.output)).toEqual([20]);
        expect(changed.generation).toBe(first.generation);
        expect(changed.revision).toBeGreaterThan(first.revision);
      },
      { timeout: 2000 },
    );
    await page.reload();
    await page.getByRole("region", { name: "Tokens" }).getByText("30", { exact: true }).waitFor();
  } finally {
    await page.close();
    writer.message(installedStep);
  }
}
