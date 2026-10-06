import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { chromium } from "playwright";
import { expect, it, onTestFailed, vi } from "vitest";
import { capture } from "./testing/process.ts";
import { checkOverview } from "./testing/dashboard.ts";
import { coldSourceCache } from "./testing/source-cache.ts";

it("bun run dev serves the same worker-driven Overview from source on synthetic history", async () => {
  const phases: string[] = [];
  const phase = (event: string) => phases.push(`${new Date().toISOString()} ${event}`);
  let startupTrace = "";
  onTestFailed(() => {
    process.stderr.write(`[cold-source-failure] ${phases.join("\n")}\n${startupTrace}\n`);
  });
  phase("cold cache");
  const restoreCache = await coldSourceCache();
  phase("starting source server");
  const child = spawn("bun", ["run", "dev"], {
    detached: true,
    // Vite decorates its URL with ANSI codes; HTTP, not terminal formatting, proves readiness.
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      DEBUG: [process.env["DEBUG"], "vite:deps"].filter(Boolean).join(","),
    },
  });
  const { closed } = capture(child);
  const recordStartup = (chunk: Buffer) => {
    startupTrace = (
      startupTrace + `${new Date().toISOString()} ${stripVTControlCharacters(chunk.toString())}`
    ).slice(-16000);
  };
  child.stdout.on("data", recordStartup);
  child.stderr.on("data", recordStartup);
  try {
    await vi.waitFor(
      async () => {
        const response = await fetch("http://127.0.0.1:5173/api/browser-copy");
        expect(response.status).toBe(200);
        await response.arrayBuffer();
        expect(child.exitCode).toBeNull();
        expect(child.signalCode).toBeNull();
      },
      { timeout: 10000 },
    );
    phase("source API ready");
    const browser = await chromium.launch({ headless: true });
    phase("browser ready");
    try {
      // Five token kinds (165) plus the nested session's one output token.
      // Missing usage, zero usage, a fork copy and a user message add nothing.
      await checkOverview(browser, "http://127.0.0.1:5173", "166", phase);
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
    } finally {
      phase("closing browser");
      await browser.close();
    }
  } catch (cause) {
    throw new Error(
      `Cold source failed. Ordered Vite startup trace (last 16000 characters):\n${startupTrace}`,
      { cause },
    );
  } finally {
    phase("stopping source server");
    try {
      if (process.platform === "win32") child.kill();
      else {
        process.kill(-child.pid!, "SIGTERM");
      }
      await closed;
    } finally {
      restoreCache();
    }
  }
});
