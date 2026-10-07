import type { Page, Locator } from "playwright";
import { decode } from "@opencode-stats/browser-copy";
import { expect, vi } from "vitest";
import type { preferencesServer } from "./preferences-server.ts";
import { wholeChange, watchChangeRequests } from "./whole-paint.ts";
import { tourTime, tourVisibility } from "./change-clock.ts";
import { buildCommitPaints } from "./build-paint.ts";
import { chartTour } from "./chart-tour.ts";

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
  "system-scheme",
  "resize",
  "pause",
  "resume",
  "live",
  "build",
  "visible",
  "minute",
  "day",
  "range-menu",
  "settings-menu",
  "expand-checklist",
  "shortcuts",
  "chart-metric",
  "chart-split",
  "drill",
  "chart-read",
  "chart-highlight",
  "chart-menu",
  "graph-select",
  "graph-metric",
  "graph-read",
] as const;
export const tourStart = Date.UTC(2026, 9, 7, 23, 58, 10);
type Input = { page: Page; touch: boolean };
type Server = Awaited<ReturnType<typeof preferencesServer>>;
type Guard = ReturnType<typeof watchChangeRequests>;

const activate = (input: Input, target: Locator) => (input.touch ? target.tap() : target.click());

async function choose(input: Input, kind: string, label: RegExp, value: string) {
  const { page } = input;
  await wholeChange(page, kind === "preset" ? "range-menu" : "settings-menu", () =>
    activate(input, page.getByRole("button", { name: label })),
  );
  await wholeChange(page, kind, () =>
    activate(input, page.getByRole("option", { name: value, exact: true })),
  );
  expect(await page.getByRole("button", { name: label }).textContent()).toBe(value);
}

async function rangesAndFilters(input: Input) {
  const { page } = input;
  await choose(input, "preset", /^Time range/, "Today");
  await wholeChange(page, "shift", () =>
    activate(input, page.getByRole("button", { name: "Previous range" })),
  );
  await wholeChange(page, "remove-fixed", () =>
    activate(input, page.getByRole("button", { name: /Remove fixed range/ })),
  );
  const checkbox = page.getByRole("region", { name: "Model", exact: true }).getByRole("checkbox", {
    name: "synthetic-model-a",
    exact: true,
  });
  await wholeChange(page, "filter", () => activate(input, checkbox));
  await wholeChange(page, "remove-filter", () =>
    activate(input, page.getByRole("button", { name: /Remove Model filter/ })),
  );
  await wholeChange(page, "filter", () => activate(input, checkbox));
  await wholeChange(page, "clear-filters", () =>
    activate(input, page.getByRole("button", { name: "Clear all" })),
  );
  await wholeChange(page, "filter", () =>
    activate(
      input,
      page
        .getByRole("region", { name: "Tool", exact: true })
        .getByRole("checkbox", { name: "read", exact: true }),
    ),
  );
  expect(await page.getByRole("button", { name: "Remove Tool filter · read" }).textContent()).toBe(
    "Tool calls: read ×",
  );
  await wholeChange(page, "remove-filter", () =>
    activate(input, page.getByRole("button", { name: "Remove Tool filter · read" })),
  );
  const search = page.getByRole("searchbox", { name: "Search Model" });
  await wholeChange(page, "search", () => search.pressSequentially("a"));
  await wholeChange(page, "search", () => search.press("Backspace"));
}

async function appearance(input: Input, repeat: number) {
  const { page } = input;
  await wholeChange(page, "settings", () =>
    activate(input, page.getByRole("button", { name: "Settings", exact: true })),
  );
  await choose(input, "theme", /^Theme /, repeat ? "Everforest" : "Matrix");
  await choose(input, "scheme", /^Color scheme/, repeat ? "Light" : "Dark");
  await choose(input, "scheme", /^Color scheme/, "System");
  for (const colorScheme of ["dark", "light"] as const) {
    await wholeChange(page, "system-scheme", () => page.emulateMedia({ colorScheme }));
    expect(await page.evaluate(() => document.documentElement.dataset["paletteScheme"])).toBe(
      colorScheme,
    );
    expect(await page.getByRole("button", { name: /^Color scheme/ }).textContent()).toBe("System");
  }
  await wholeChange(page, "shortcuts", () =>
    activate(input, page.getByText("Single-key shortcuts", { exact: true })),
  );
  await wholeChange(page, "settings", () =>
    activate(input, page.getByRole("button", { name: "Done" })),
  );
  const before = page.viewportSize()!;
  for (const width of [767, 768, before.width]) {
    await wholeChange(page, "resize", () => page.setViewportSize({ ...before, width }));
    expect(await page.evaluate(() => matchMedia("(min-width: 768px)").matches)).toBe(width >= 768);
  }
}

async function contributionChanges(input: Input, repeat: number) {
  const graph = input.page.getByRole("group", { name: "Contribution metric" });
  await wholeChange(input.page, "graph-metric", () =>
    activate(input, graph.getByRole("button", { name: repeat ? "Cost" : "Steps", exact: true })),
  );
  const surface = input.page.getByRole("img", { name: "Contribution graph, past 365 local days" });
  await surface.focus();
  await wholeChange(input.page, "graph-read", () => surface.press("ArrowLeft"));
  const readout = input.page.locator(".graph-readout");
  await wholeChange(input.page, "graph-select", () =>
    activate(input, readout.getByRole("button", { name: "This day", exact: true })),
  );
  await wholeChange(input.page, "graph-select", () =>
    activate(input, readout.getByRole("button", { name: /^Week / })),
  );
  await wholeChange(input.page, "graph-select", () =>
    activate(input, readout.getByRole("button", { name: /^(September|October)$/ })),
  );
}

const write = (server: Server, input: number) => {
  server.writer.message({
    id: "msg-tour",
    session: "ses-tour",
    seq: 0,
    start: tourStart - 60000,
    model: "synthetic-model-a",
    provider: "synthetic-provider",
    tokens: { input },
    tools: [
      {
        id: "read",
        name: "read",
        status: "completed",
        ran: tourStart - 59000,
        completed: tourStart - 58000,
      },
      {
        id: "shell",
        name: "shell",
        status: "error",
        error: input < 400 ? "permission.rejected" : "tool.execution",
      },
      {
        id: "execute",
        name: "execute",
        status: "completed",
        nested: [{ id: "nested", name: "hidden.lookup", status: "completed" }],
      },
    ],
  });
};

const stored = (server: Server, input: number) =>
  vi.waitFor(async () => {
    const response = await fetch(`${server.origin}/api/browser-copy`);
    const copy = decode(await response.arrayBuffer());
    expect([...copy.steps.input]).toContain(input);
  });

async function liveChanges(input: Input, server: Server, guard: Guard, repeat: number) {
  const { page } = input;
  await wholeChange(page, "pause", () =>
    activate(input, page.getByRole("button", { name: /Pause live updates/ })),
  );
  const paused = await page.evaluate(() => window.wholePaint.snapshot());
  write(server, 300 + repeat);
  await stored(server, 300 + repeat);
  expect(
    await page.evaluate((before) => window.wholePaint.snapshot() === before, paused),
    "whole-paint:paused-changed",
  ).toBe(true);
  guard.live(true);
  await wholeChange(page, "resume", () =>
    activate(input, page.getByRole("button", { name: "Resume", exact: true })),
  );
  await wholeChange(page, "live", async () => {
    write(server, 400 + repeat);
  });
  const hidden = await page.evaluate(() => window.wholePaint.snapshot());
  await tourVisibility(page, true);
  write(server, 500 + repeat);
  await stored(server, 500 + repeat);
  expect(
    await page.evaluate((before) => window.wholePaint.snapshot() === before, hidden),
    "whole-paint:hidden-changed",
  ).toBe(true);
  await wholeChange(page, "visible", () => tourVisibility(page, false));
  await wholeChange(page, "live", async () => {
    server.writer.migration("20261007120000_whole_paint_future");
  });
  expect(await page.locator('.update-status[data-sync-reason="schema.newer"]').count()).toBe(1);
  expect(
    await page.getByRole("button", { name: /Not updating · Pause live updates/ }).count(),
  ).toBe(1);
  await wholeChange(page, "live", async () => {
    server.writer.migration("20261007120000_whole_paint_future", false);
  });
  expect(await page.locator(".update-status").count()).toBe(0);
}

export function changeTour(page: Page, server: Server, guard: Guard, touch: boolean) {
  let now = tourStart;
  const input = { page, touch };
  return {
    prepare: async () => {
      for (const dimension of ["Model", "Provider"]) {
        await wholeChange(page, "expand-checklist", () =>
          activate(
            input,
            page
              .getByRole("region", { name: dimension, exact: true })
              .getByRole("button", { name: /more$/ }),
          ),
        );
      }
    },
    round: async (repeat: number) => {
      guard.live(true);
      await buildCommitPaints(page, (amount) => write(server, amount), now);
      guard.live(false);
      await rangesAndFilters(input);
      await chartTour(page, touch, repeat);
      await contributionChanges(input, repeat);
      await appearance(input, repeat);
      await liveChanges(input, server, guard, repeat);
      guard.live(false);
      now += 60000;
      await wholeChange(page, "minute", () => tourTime(page, now));
      // Jump over midnight without accelerating the monotonic work/paint clock.
      now = Date.UTC(2026, 9, 8 + repeat, 0, 0, 10);
      await wholeChange(page, "day", () => tourTime(page, now));
      await choose(input, "preset", /^Time range/, "All time");
      guard.check();
    },
  };
}
