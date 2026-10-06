import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { observePreferences, wholePreferenceChange } from "./testing/preference-paint.ts";
import { preferenceEvidence } from "./testing/preference-evidence.ts";

it("captures a controlled installed-page action failure without replacing its error", async () => {
  await using fixture = await preferencesBrowser(chromium);
  const page = await fixture.context.newPage();
  await using evidence = await preferenceEvidence(page);
  await evidence.action("first-navigation", () => page.goto(fixture.server.origin));
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  await observePreferences(page);
  await evidence.action("first-settings", () =>
    page.getByRole("button", { name: "Settings", exact: true }).click(),
  );
  const trigger = page.getByRole("button", { name: /^Theme / });
  await trigger.evaluate((element) => element.setAttribute("aria-disabled", "true"));
  await page
    .getByRole("region", { name: "Tokens" })
    .locator(".headline-number")
    .evaluate((element) => {
      element.textContent = "synthetic-private-headline-not-for-diagnostics";
    });
  for (let index = 0; index < 70; index++) evidence.mark("bounded-probe", "observed");
  await page.evaluate(() => {
    for (let index = 0; index < 40; index++) document.dispatchEvent(new Event("visibilitychange"));
  });
  const output = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  let original: Error | undefined;
  let originalStack: string | undefined;
  try {
    await expect(
      wholePreferenceChange(
        page,
        () =>
          evidence.action("theme-trigger", async () => {
            try {
              await trigger.click();
            } catch (error) {
              if (!(error instanceof Error)) throw error;
              original = error;
              originalStack = error.stack;
              throw error;
            }
          }),
        evidence,
      ),
    ).rejects.toSatisfy((error: Error) => error === original && error.stack === originalStack);
    expect(original?.message).toContain("3000ms");
    expect(output).toHaveBeenCalledTimes(1);
    const report = String(output.mock.calls[0]![0]);
    expect(report).toContain('"label":"theme-trigger","state":"failed"');
    expect(report).toContain('"disabled":true');
    expect(report).toContain('"visibility":"visible"');
    expect(report).toContain('"rafCount":');
    expect(report).toContain('"rect":');
    expect(report.match(/"sequence":/gu)).toHaveLength(64);
    expect(report).not.toContain("synthetic-private-headline-not-for-diagnostics");
    expect(report).not.toContain(fixture.server.origin);
    expect(await page.evaluate(() => window.preferenceEvidence.frames.length)).toBe(8);
    expect(await page.evaluate(() => window.preferenceEvidence.events.length)).toBe(32);
    await evidence[Symbol.asyncDispose]();
    expect(
      await page.evaluate(() => {
        const events = JSON.stringify(window.preferenceEvidence.events);
        document.dispatchEvent(new Event("visibilitychange"));
        return {
          running: window.preferenceEvidence.running,
          unchanged: events === JSON.stringify(window.preferenceEvidence.events),
        };
      }),
    ).toEqual({ running: false, unchanged: true });
  } finally {
    output.mockRestore();
  }
});

it.each(["closed", "rejected", "stalled", "reporter"])(
  "preserves the original error and cause when diagnostic capture is %s",
  async (failure) => {
    await using browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    await using evidence = await preferenceEvidence(page);
    await page.goto("about:blank");
    const cause = new Error("synthetic original cause");
    const original = new Error("synthetic original action", { cause });
    const stack = original.stack;
    const output = vi.spyOn(process.stderr, "write").mockImplementation(() => {
      if (failure === "reporter") throw new Error("synthetic reporting failure");
      return true;
    });
    const evaluation = vi.spyOn(page, "evaluate");
    try {
      if (failure === "closed") await page.close();
      if (failure === "rejected")
        evaluation.mockRejectedValue(new Error("synthetic capture failure"));
      if (failure === "stalled") evaluation.mockImplementation(() => new Promise<never>(() => {}));
      if (failure === "reporter") {
        const captured = await page.evaluate(() => window.preferenceEvidence.snapshot());
        evaluation.mockResolvedValue(captured);
      }
      await expect(
        evidence.action("controlled-original", async () => {
          throw original;
        }),
      ).rejects.toBe(original);
      expect(original.stack).toBe(stack);
      expect(original.cause).toBe(cause);
      expect(output).toHaveBeenCalledTimes(1);
      const report = String(output.mock.calls[0]![0]);
      expect(report.includes('"unavailable":true')).toBe(failure !== "reporter");
      expect(report.includes('"state":"closed"')).toBe(failure === "closed");
      expect(report).not.toContain("synthetic original");
      expect(report).not.toContain("synthetic capture failure");
    } finally {
      evaluation.mockRestore();
      output.mockRestore();
    }
  },
);
