import { chromium } from "playwright";
import { expect, it } from "vitest";
import { formatVersion } from "@opencode-stats/browser-copy";
import { preferencesBrowser } from "./testing/preferences-server.ts";

it.each(["format", "release"])(
  "reloads a packed tab for a changed %s while keeping its address",
  async (kind) => {
    await using fixture = await preferencesBrowser(chromium);
    await fixture.context.route(
      "**/api/browser-copy/live",
      (route) =>
        route.fulfill({
          contentType: "text/event-stream",
          body: `data: ${JSON.stringify({ generation: "replacement", revision: 1, release: "replacement-release", format: formatVersion + Number(kind === "format") })}\n\n`,
        }),
      { times: 1 },
    );
    const page = await fixture.context.newPage();
    let navigations = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest()) navigations++;
    });
    const address = `${fixture.server.origin}/?range=all`;
    await page.goto(address);
    await page.getByRole("heading", { name: "Overview" }).waitFor();
    let visibleNavigations = 0;
    if (kind === "release") {
      await page.waitForTimeout(250);
      visibleNavigations = navigations;
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    expect(visibleNavigations).toBe(kind === "release" ? 1 : 0);
    await expect.poll(() => navigations).toBe(2);
    await page.getByRole("region", { name: "Tokens" }).getByText("987", { exact: true }).waitFor();
    expect(page.url()).toBe(address);
  },
);
