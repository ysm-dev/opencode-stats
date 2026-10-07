import type { Page } from "playwright";
import { expect } from "vitest";
import { wholeChange } from "./whole-paint.ts";

export async function chartTour(page: Page, touch: boolean, repeat: number) {
  const activate = (name: RegExp | string, role: "button" | "option") => {
    const target = page.getByRole(role, { name, exact: typeof name === "string" });
    return touch ? target.tap() : target.click();
  };
  await wholeChange(page, "range-menu", () => activate(/^Time range/, "button"));
  await wholeChange(page, "preset", () => activate("Last 7 days", "option"));
  for (const [label, kind, value] of [
    ["Chart metric", "chart-metric", repeat ? "Tokens" : "Steps"],
    ["Chart split", "chart-split", repeat ? "model" : "provider"],
  ]) {
    await wholeChange(page, "chart-menu", () => activate(new RegExp(`^${label}`), "button"));
    await wholeChange(page, kind!, () => activate(value!, "option"));
  }
  const chart = page.locator(".chart-hit");
  await wholeChange(page, "chart-read", () =>
    touch ? chart.tap({ position: { x: 72, y: 80 } }) : chart.hover({ position: { x: 72, y: 80 } }),
  );
  await wholeChange(page, "chart-read", () => chart.press("Home"));
  expect(await page.locator(".chart-readout h3").textContent()).not.toBe("Range totals");
  await wholeChange(page, "chart-highlight", () =>
    page.locator(".chart-readout li button").first().focus(),
  );
  await wholeChange(page, "chart-highlight", () => chart.focus());
  await wholeChange(page, "drill", () => activate("Drill in", "button"));
  expect(await chart.getAttribute("aria-label")).toContain("by hour");
  await wholeChange(page, "chart-read", () => chart.press("End"));
  await wholeChange(page, "chart-read", () => chart.press("Escape"));
  expect(await page.locator(".chart-readout h3").textContent()).toBe("Range totals");
}
