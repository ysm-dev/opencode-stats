import type { Page } from "playwright";
import { decode, encode } from "@opencode-stats/browser-copy";
import { expect } from "vitest";
import { wholeChange } from "./whole-paint.ts";

// The installed dashboard reads genuine packed-server facts. Only the public
// copy header is controlled, so small synthetic builds can hold both milestones.
export async function buildCommitPaints(page: Page, write: (input: number) => void, now: number) {
  let complete = false;
  const route = "**/api/browser-copy/changes?*";
  await page.context().route(route, async (request) => {
    const response = await request.fetch();
    const bytes = await response.body();
    const copy = decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const midnight = Math.floor(now / 86400000) * 86400000;
    await request.fulfill({
      response,
      body: Buffer.from(
        encode({
          ...copy,
          historyComplete: complete,
          historyCompleteFrom: midnight,
        }),
      ),
    });
  });
  try {
    await wholeChange(page, "build", async () => {
      write(601);
    });
    expect(await page.locator(".update-status").textContent()).toContain(
      "older history is still being read",
    );
    expect(await page.locator(".update-status").getAttribute("data-warning")).toBe("false");
    expect(await page.locator(".live-status").getAttribute("data-updating")).toBe("true");
    complete = true;
    await wholeChange(page, "build", async () => {
      write(602);
    });
    expect(await page.locator(".update-status").count()).toBe(0);
  } finally {
    await page.context().unroute(route);
  }
}
