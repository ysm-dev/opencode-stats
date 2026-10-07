import { cleanup, screen } from "@solidjs/testing-library";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { metricCopy } from "@opencode-stats/engine/testing";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";

beforeEach(() => dashboardEnvironment("/"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("paints the five headline numbers, bases and previous-period changes from the real engine", async () => {
  const f = dashboardFixture(metricCopy());
  try {
    const range = await f.view.findByRole("button", { name: /^Time range/ });
    await f.user.click(range);
    await f.user.click(await screen.findByRole("option", { name: "Today" }));
    await vi.waitFor(() =>
      expect(f.view.getByRole("region", { name: "Steps" }).textContent).toContain("2 per prompt"),
    );
    for (const [name, value, line, change] of [
      ["Steps", "4", "2 per prompt", "↑ 300%"],
      ["Prompts", "2", "", "↑ 100%"],
      ["Failed steps", "2", "50% failure rate · 1 interrupted", "↑ 100%"],
      ["Response time p50", "2 s", "p95 8 s · 75% of steps timed", "↑ 100%"],
      ["Cache hit rate", "50%", "context size median 200", "↑ 0%"],
    ] as const) {
      const region = f.view.getByRole("region", { name });
      expect(region.querySelector(".headline-number")!.textContent).toBe(value);
      expect(region.textContent).toContain(line);
      expect(region.querySelector(".previous-period")!.textContent).toContain(change);
      expect(region.getAttribute("data-range")).toBe("/?range=today");
    }
    expect(f.view.getByText("Recorded from 6 Oct 2026")).toBeTruthy();
    expect(f.view.getByRole("list", { name: "Failure rate by error type" }).textContent).toContain(
      "api · 1 failed · 25%",
    );
    expect(
      f.view
        .getByRole("region", { name: "Prompts" })
        .querySelectorAll("p:not(.headline-number):not(.previous-period)"),
    ).toHaveLength(0);
    await f.user.click(range);
    await f.user.click(await screen.findByRole("option", { name: "All time" }));
    await vi.waitFor(() => expect(f.view.container.querySelector(".previous-period")).toBeNull());
  } finally {
    await f.close();
  }
});

it("shows missing measurements as unavailable, never zero, and removes the recorded-from line after a live replacement", async () => {
  const f = dashboardFixture(metricCopy());
  try {
    await f.view.findByText("Recorded from 6 Oct 2026");
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    f.server.commit(syntheticCopy([], { revision: 2 }));
    await vi.waitFor(() => expect(f.view.queryByText(/Recorded from/)).toBeNull());
    const response = f.view.getByRole("region", { name: "Response time p50" });
    expect(response.querySelector(".headline-number")!.textContent).toBe("—");
    expect(response.textContent).toContain("p95 — · — of steps timed");
    const steps = f.view.getByRole("region", { name: "Steps" });
    expect(steps.textContent).toContain("— per prompt");
    const cache = f.view.getByRole("region", { name: "Cache hit rate" });
    expect(cache.querySelector(".headline-number")!.textContent).toBe("—");
    expect(cache.textContent).toContain("context size median —");
    expect(f.view.getByRole("region", { name: "Failed steps" }).textContent).toContain(
      "— failure rate · 0 interrupted",
    );
  } finally {
    await f.close();
  }
});
