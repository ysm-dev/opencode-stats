import { cleanup, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";

beforeEach(() => dashboardEnvironment("/?range=today"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const row = (date: string, estimatedCost: number | null, recordedCost = 0) => ({
  start: Date.parse(date),
  input: 100,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
  estimatedCost,
  recordedCost,
});
it("marks estimated Cost visibly and as 'about', presents recorded cost and priced-token share, and paints comparisons and live repricing whole", async () => {
  await using f = dashboardFixture(
    syntheticCopy([
      row("2026-10-01T12:00Z", 1),
      row("2026-10-06T12:00Z", 1),
      row("2026-10-07T12:00Z", 2, 9),
      row("2026-10-07T12:01Z", null),
    ]),
  );
  const region = await f.view.findByRole("region", { name: "about Cost" });
  expect(region.querySelector("h2")!.textContent).toContain("≈");
  expect(region.querySelector(".headline-number")!.textContent).toContain("≈ about $2");
  expect(region.querySelector(".headline-number .sr-only")!.textContent).toBe("about ");
  expect(region.textContent).toContain("$9 recorded cost · 50% of tokens priced");
  expect(region.querySelector(".previous-period")!.textContent).toContain("↑ 100%");
  const mark = region.getAttribute("data-state");
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy(
      [
        row("2026-10-01T12:00Z", 1),
        row("2026-10-06T12:00Z", 1),
        row("2026-10-07T12:00Z", 0, 9),
        row("2026-10-07T12:01Z", 0),
      ],
      { revision: 2 },
    ),
  );
  await vi.waitFor(() =>
    expect(region.textContent).toContain("$9 recorded cost · 100% of tokens priced"),
  );
  expect(region.querySelector(".headline-number")!.textContent).toContain("$0");
  expect(region.querySelector(".previous-period")!.textContent).toContain("↓ 100%");
  expect(region.getAttribute("data-state")).not.toBe(mark);
  expect(
    new Set(
      [...f.view.container.querySelectorAll("[data-state]")].map((node) =>
        node.getAttribute("data-state"),
      ),
    ).size,
  ).toBe(1);
  await f.user.click(f.view.getByRole("button", { name: /^Time range/ }));
  await f.user.click(await screen.findByRole("option", { name: "All time", exact: true }));
  await vi.waitFor(() => expect(region.querySelector(".previous-period")).toBeNull());
});

it("shows unavailable estimates, and never presents an unpriced model as free", async () => {
  await using f = dashboardFixture(syntheticCopy([row("2026-10-07T12:00Z", null)]));
  const region = await f.view.findByRole("region", { name: "about Cost" });
  expect(region.querySelector(".headline-number")!.textContent).toContain("—");
  expect(region.textContent).toContain("$0 recorded cost · 0% of tokens priced");
  f.server.commit(syntheticCopy([], { revision: 2 }));
  await vi.waitFor(() => expect(region.textContent).toContain("— of tokens priced"));
});
