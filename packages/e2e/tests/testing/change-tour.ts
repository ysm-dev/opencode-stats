import type { Page, Locator } from "playwright";
import { decode } from "@opencode-stats/browser-copy";
import { expect, vi } from "vitest";
import type { preferencesServer } from "./preferences-server.ts";
import { wholeChange, watchChangeRequests } from "./whole-paint.ts";
import { tourTime, tourVisibility } from "./change-clock.ts";

// Every ticket introducing a kind adds it here. This same tour is reusable by
// CI and the reference runner; all content/writes here are explicitly synthetic.
export const currentChangeKinds = [
  "preset",
  "shift",
  "remove-fixed",
  "filter",
  "remove-filter",
  "clear-filters",
  "search",
  "settings",
  "theme",
  "scheme",
  "pause",
  "resume",
  "live",
  "visible",
  "minute",
  "day",
  "range-menu",
  "settings-menu",
  "expand-checklist",
  "shortcuts",
] as const;
export const tourStart = Date.UTC(2026, 9, 7, 23, 58, 10);

export async function changeTour(
  page: Page,
  server: Awaited<ReturnType<typeof preferencesServer>>,
  guard: ReturnType<typeof watchChangeRequests>,
  touch: boolean,
) {
  let now = tourStart;
  const activate = (target: Locator) => (touch ? target.tap() : target.click());
  const choose = async (kind: string, label: RegExp, value: string) => {
    await wholeChange(page, kind === "preset" ? "range-menu" : "settings-menu", () =>
      activate(page.getByRole("button", { name: label })),
    );
    await wholeChange(page, kind, () =>
      activate(page.getByRole("option", { name: value, exact: true })),
    );
    expect(await page.getByRole("button", { name: label }).textContent()).toBe(value);
  };
  const model = page.getByRole("region", { name: "Model", exact: true });
  const checkbox = model.getByRole("checkbox", {
    name: "synthetic-provider/synthetic-model-a",
    exact: true,
  });
  const write = (input: number) => {
    server.writer.message({
      id: "msg-tour",
      session: "ses-tour",
      seq: 0,
      start: tourStart - 60000,
      model: "synthetic-model-a",
      provider: "synthetic-provider",
      tokens: { input },
    });
  };
  const stored = (input: number) =>
    vi.waitFor(async () => {
      const response = await fetch(`${server.origin}/api/browser-copy`);
      const copy = decode(await response.arrayBuffer());
      expect([...copy.steps.input]).toContain(input);
    });
  for (const dimension of ["Model", "Provider"]) {
    await wholeChange(page, "expand-checklist", () =>
      activate(
        page
          .getByRole("region", { name: dimension, exact: true })
          .getByRole("button", { name: /more$/ }),
      ),
    );
  }
  for (let repeat = 0; repeat < 2; repeat++) {
    guard.live(false);
    await choose("preset", /^Time range/, "Today");
    await wholeChange(page, "shift", () =>
      activate(page.getByRole("button", { name: "Previous range" })),
    );
    await wholeChange(page, "remove-fixed", () =>
      activate(page.getByRole("button", { name: /Remove fixed range/ })),
    );
    await wholeChange(page, "filter", () => activate(checkbox));
    await wholeChange(page, "remove-filter", () =>
      activate(page.getByRole("button", { name: /Remove Model filter/ })),
    );
    await wholeChange(page, "filter", () => activate(checkbox));
    await wholeChange(page, "clear-filters", () =>
      activate(page.getByRole("button", { name: "Clear all" })),
    );
    const search = page.getByRole("searchbox", { name: "Search Model" });
    await wholeChange(page, "search", () => search.pressSequentially("a"));
    await wholeChange(page, "search", () => search.press("Backspace"));
    await wholeChange(page, "settings", () =>
      activate(page.getByRole("button", { name: "Settings", exact: true })),
    );
    await choose("theme", /^Theme /, repeat ? "Everforest" : "Matrix");
    await choose("scheme", /^Color scheme/, repeat ? "Light" : "Dark");
    await wholeChange(page, "shortcuts", () =>
      activate(page.getByRole("switch", { name: "Single-key shortcuts" })),
    );
    await wholeChange(page, "settings", () => activate(page.getByRole("button", { name: "Done" })));
    await wholeChange(page, "pause", () =>
      activate(page.getByRole("button", { name: /Pause live updates/ })),
    );
    const paused = await page.evaluate(() => window.wholePaint.snapshot());
    write(300 + repeat);
    await stored(300 + repeat);
    expect(
      await page.evaluate((before) => window.wholePaint.snapshot() === before, paused),
      "whole-paint:paused-changed",
    ).toBe(true);
    guard.live(true);
    await wholeChange(page, "resume", () =>
      activate(page.getByRole("button", { name: "Resume", exact: true })),
    );
    await wholeChange(page, "live", async () => {
      write(400 + repeat);
    });
    const hidden = await page.evaluate(() => window.wholePaint.snapshot());
    await tourVisibility(page, true);
    write(500 + repeat);
    await stored(500 + repeat);
    expect(
      await page.evaluate((before) => window.wholePaint.snapshot() === before, hidden),
      "whole-paint:hidden-changed",
    ).toBe(true);
    await wholeChange(page, "visible", () => tourVisibility(page, false));
    guard.live(false);
    now += 60000;
    await wholeChange(page, "minute", () => tourTime(page, now));
    // Jump over midnight without accelerating the monotonic work/paint clock.
    now = Date.UTC(2026, 9, 8 + repeat, 0, 0, 10);
    await wholeChange(page, "day", () => tourTime(page, now));
    await choose("preset", /^Time range/, "All time");
    guard.check();
  }
}
