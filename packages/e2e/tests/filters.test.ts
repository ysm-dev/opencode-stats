import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { observeFilters, wholeFilter } from "./testing/filter-paint.ts";

const require = createRequire(import.meta.url);
it.each([chromium, webkit])(
  "paints packed filters whole, sends no requests, restores IDs and passes accessible checklists and chips in %s",
  async (browser) => {
    const touch = browser === webkit;
    await using f = await preferencesBrowser(browser, {
      hasTouch: touch,
      viewport: { width: touch ? 360 : 1280, height: 720 },
      timezoneId: "UTC",
    });
    f.server.writer.reset();
    const now = Date.now() - 60000;
    for (let i = 0; i < 7; i++) {
      const session = `ses-filter-${i}`;
      f.server.writer.session(session, null, { title: `Synthetic ${i}` });
      f.server.writer.message({
        id: `msg-filter-${i}`,
        session,
        seq: 0,
        start: now,
        model: `filter-model-${i}`,
        provider: `filter-provider-${i % 2}`,
        variant: i % 2 ? "high" : "default",
        agent: i % 2 ? "plan" : "build",
        tokens: { input: (i + 1) * 100 },
      });
    }
    const page = await f.context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${f.server.origin}/?range=all`);
    await page.waitForFunction(
      () => document.querySelector(".headline-number")?.textContent === "2,800",
    );
    const models = page.getByRole("region", { name: "Model", exact: true });
    expect(await models.getByRole("checkbox").count()).toBe(5);
    await models.getByRole("button", { name: "2 more" }).click();
    expect(await models.getByRole("checkbox").count()).toBe(7);
    const model6 = models.getByRole("checkbox", {
      name: "filter-provider-0/filter-model-6",
      exact: true,
    });
    const model5 = models.getByRole("checkbox", {
      name: "filter-provider-1/filter-model-5",
      exact: true,
    });
    await observeFilters(page);
    const requests: string[] = [];
    f.context.on("request", (request) => requests.push(request.url()));
    await wholeFilter(page, () => model6.click(), "700");
    expect(await model6.isChecked()).toBe(true);
    expect(await model6.evaluate((input) => input === document.activeElement)).toBe(true);
    await wholeFilter(page, () => model5.click(), "1,300");
    const bookmark = page.url();
    await wholeFilter(page, () => model6.click(), "600");
    await wholeFilter(
      page,
      () =>
        page
          .getByRole("button", { name: "Remove Model filter · filter-provider-1/filter-model-5" })
          .click(),
      "2,800",
    );
    expect(
      await page
        .getByRole("heading", { name: "Active filters" })
        .evaluate((heading) => heading === document.activeElement),
    ).toBe(true);
    await wholeFilter(page, () => model6.click(), "700");
    await wholeFilter(page, () => page.getByRole("button", { name: "Clear all" }).click(), "2,800");
    expect(await page.locator(".filter-announcement").textContent()).toBe("Filters cleared");
    expect(
      await page
        .getByRole("button", { name: "Clear all" })
        .evaluate((button) => button === document.activeElement),
    ).toBe(true);
    await wholeFilter(
      page,
      async () => {
        await page.goBack();
      },
      "700",
    );
    await wholeFilter(
      page,
      async () => {
        await page.goForward();
      },
      "2,800",
    );
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.goto(bookmark);
    await page
      .getByRole("button", { name: "Remove Model filter · filter-provider-0/filter-model-6" })
      .waitFor();
    expect(page.url()).toBe(bookmark);
    expect(
      await page.getByRole("region", { name: "Tokens" }).locator(".headline-number").textContent(),
    ).toBe("1,300");
    const search = page.getByRole("searchbox", { name: "Search Model" });
    await search.fill("filter-model-6");
    expect(await models.locator("[aria-live]").textContent()).toBe("1 results");
    await search.fill("not-present");
    expect(await models.locator("[aria-live]").textContent()).toBe("No matches");
    await search.fill("");
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const results = await page.evaluate(() => window.axe.run());
    expect(results.violations).toEqual([]);
    expect(results.incomplete).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const sizes = await page
      .locator(".filters input, .filters button, .filter-chips button")
      .evaluateAll((controls) =>
        controls.map((control) => ({
          width: control.getBoundingClientRect().width,
          height: control.getBoundingClientRect().height,
        })),
      );
    expect(sizes.every((size) => size.width >= 24 && size.height >= 24)).toBe(true);
    await page.goto(`${f.server.origin}/?range=all&f.session=deleted-session`);
    await page.getByRole("button", { name: "Remove Session filter · deleted-session" }).waitFor();
    expect(
      await page.getByRole("region", { name: "Tokens" }).locator(".headline-number").textContent(),
    ).toBe("0");
    expect(new URL(page.url()).searchParams.get("f.session")).toBe("deleted-session");
    expect(errors).toEqual([]);
  },
);
