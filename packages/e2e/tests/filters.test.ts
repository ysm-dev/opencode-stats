import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { filterBrowser } from "./testing/filter-fixture.ts";
import { observeFilterFocus, observeFilters, wholeFilter } from "./testing/filter-paint.ts";

const require = createRequire(import.meta.url);
it.each([chromium, webkit])(
  "paints packed filters whole, sends no requests, restores IDs and passes accessible checklists and chips in %s",
  async (browser) => {
    await using f = await filterBrowser(browser);
    const { page, errors } = f;
    const models = page.getByRole("region", { name: "Model", exact: true });
    expect(await models.getByRole("checkbox").count()).toBe(5);
    await models.getByRole("button", { name: "3 more" }).click();
    expect(await models.getByRole("checkbox").count()).toBe(8);
    expect(
      await models
        .getByRole("checkbox")
        .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label"))),
    ).toEqual([
      "filter-provider-0/filter-model-6",
      "filter-provider-1/filter-model-5",
      "filter-provider-0/filter-model-4",
      "filter-provider-1/filter-model-3",
      "filter-provider-0/filter-model-2",
      "filter-provider-1/filter-model-1",
      "filter-provider-0/filter-model-0",
      "synthetic-provider/synthetic-model",
    ]);
    expect(
      await models
        .getByRole("checkbox", { name: "synthetic-provider/synthetic-model", exact: true })
        .evaluate((input) => input.closest("label")!.querySelector(".filter-amount")!.textContent),
    ).toBe("0 tokens");
    const model6 = models.getByRole("checkbox", {
      name: "filter-provider-0/filter-model-6",
      exact: true,
    });
    const model5 = models.getByRole("checkbox", {
      name: "filter-provider-1/filter-model-5",
      exact: true,
    });
    const focusProbe = await observeFilterFocus(model6);
    await model6.focus();
    await observeFilters(page);
    const requests: string[] = [];
    f.context.on("request", (request) => requests.push(request.url()));
    await wholeFilter(page, () => model6.click(), "700");
    expect(await model6.isChecked()).toBe(true);
    const focusTrace = await focusProbe.evaluate(({ element, events }) => ({
      same: document.getElementById(element.id) === element,
      connected: element.isConnected,
      active: document.activeElement?.id || document.activeElement?.tagName,
      events,
    }));
    expect(
      await model6.evaluate((input) => input === document.activeElement),
      `[DEBUG-filter-focus] ${JSON.stringify(focusTrace)}`,
    ).toBe(true);
    await focusProbe.dispose();
    await wholeFilter(page, () => model5.click(), "1,300");
    const bookmark = page.url();
    await wholeFilter(page, () => model6.click(), "600");
    const chip = page.getByRole("button", {
      name: "Remove Model filter · filter-provider-1/filter-model-5",
    });
    await chip.focus();
    await wholeFilter(page, () => chip.click(), "2,800");
    expect(
      await page
        .getByRole("heading", { name: "Active filters" })
        .evaluate((heading) => heading === document.activeElement),
    ).toBe(true);
    await wholeFilter(page, () => model6.click(), "700");
    const clear = page.getByRole("button", { name: "Clear all" });
    await clear.focus();
    await wholeFilter(page, () => clear.click(), "2,800");
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
