import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dashboard } from "./dashboard.tsx";
import { inThreadEngine, manualClock } from "@opencode-stats/engine/testing";
import { syntheticCopy, inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { accessible } from "./testing/accessibility.ts";

it("loads no shell before today is complete, then grows whole without announcing or losing filter focus", async () => {
  dashboardEnvironment("/?range=all");
  const today = Date.parse("2026-10-07T00:00Z");
  const facts = [today - 86400000, today + 1].map((start) => ({
    start,
    input: 5,
    cacheRead: null,
    cacheWrite: null,
    output: null,
    reasoning: null,
  }));
  const server = inMemoryDashboardServer(
    syntheticCopy(facts, { historyComplete: false, historyCompleteFrom: today + 1 }),
  );
  const clock = manualClock();
  const engine = inThreadEngine(server.fetch, queueMicrotask, {
    ...clock,
    timeZone: () => "UTC",
    locale: () => "en-US",
  });
  const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
  try {
    await vi.waitFor(() => expect(server.streams).toBe(1));
    expect(view.container.textContent).toBe("");
    server.commit(
      syntheticCopy(facts, { revision: 2, historyComplete: false, historyCompleteFrom: today }),
    );
    await view.findByRole("heading", { name: "Overview" });
    expect(view.getByRole("region", { name: "Tokens" }).textContent).toBe("Tokens5");
    expect(view.container.querySelector(".update-status")?.textContent).toBe(
      "History from Oct 7 · older history is still being read",
    );
    expect(view.container.querySelector(".update-status")?.getAttribute("data-warning")).toBe(
      "false",
    );
    expect(view.container.querySelector(".live-status")?.getAttribute("data-updating")).toBe(
      "true",
    );
    const announcements = view.getAllByRole("status").map((node) => node.textContent);
    const search = view.getByRole("searchbox", { name: "Search Model" });
    await userEvent.setup().click(search);
    server.commit(syntheticCopy(facts, { revision: 3 }));
    await vi.waitFor(() =>
      expect(view.getByRole("region", { name: "Tokens" }).textContent).toBe("Tokens10"),
    );
    expect(view.container.querySelector(".update-status")).toBeNull();
    expect(document.activeElement).toBe(search);
    expect(view.getAllByRole("status").map((node) => node.textContent)).toEqual(announcements);
    expect(document.title).toBe("Overview · All time · opencode-stats");
    await accessible(view.container);
  } finally {
    cleanup();
    await engine.dispose();
    await server.dispose();
    vi.unstubAllGlobals();
  }
});
