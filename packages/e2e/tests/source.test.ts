import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { capture } from "./testing/process.ts";
import { checkOverview } from "./testing/dashboard.ts";

it("bun run dev serves the same worker-driven Overview from source on synthetic history", async () => {
  const child = spawn("bun", ["run", "dev"], { detached: true });
  const { transcript, closed } = capture(child);
  try {
    await vi.waitFor(() => expect(transcript.output).toContain("http://127.0.0.1:5173/"), {
      timeout: 10000,
    });
    await vi.waitFor(
      async () => {
        const response = await fetch("http://127.0.0.1:5173/api/browser-copy");
        expect(response.status).toBe(200);
        await response.arrayBuffer();
      },
      { timeout: 10000 },
    );
    const browser = await chromium.launch({ headless: true });
    try {
      // The builder's five-token fixture is 11 + 22 + 33 + 44 + 55 = 165.
      // Missing usage, zero usage, a fork copy and a user message add nothing.
      await checkOverview(browser, "http://127.0.0.1:5173", "165");
    } finally {
      await browser.close();
    }
  } finally {
    if (process.platform === "win32") child.kill();
    else {
      process.kill(-child.pid!, "SIGTERM");
    }
    await closed;
  }
});
