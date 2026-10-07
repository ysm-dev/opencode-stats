import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  inMemoryDashboardServer,
  syntheticCopy,
  syntheticStop,
} from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, manualClock } from "@opencode-stats/engine/testing";
import { Dashboard } from "./dashboard.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";

it("does not mutate the announced partial-history warning when pause, resume or regional clocks change its displayed line", async () => {
  dashboardEnvironment("/?range=all");
  const today = Date.parse("2026-10-07T00:00Z");
  const server = inMemoryDashboardServer(
    syntheticCopy(
      [{ start: today + 1, input: 10, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }],
      { historyComplete: false, historyCompleteFrom: today },
    ),
  );
  const clock = manualClock();
  let zone = "UTC";
  const engine = inThreadEngine(server.fetch, queueMicrotask, { ...clock, timeZone: () => zone });
  const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
  let observer: MutationObserver | undefined;
  try {
    await view.findByRole("heading", { name: "Overview" });
    await vi.waitFor(() => expect(server.streams).toBe(1));
    server.status(syntheticStop());
    await vi.waitFor(() =>
      expect(view.container.querySelector(".update-status")?.textContent).toContain("not updating"),
    );
    const liveRegion = view
      .getAllByRole("status")
      .find((node) => node.textContent?.startsWith("History from"))!;
    const original = liveRegion.textContent;
    const mutations: string[] = [];
    observer = new MutationObserver(() => mutations.push(liveRegion.textContent ?? ""));
    observer.observe(liveRegion, { childList: true, characterData: true, subtree: true });
    const user = userEvent.setup();
    await user.click(view.getByRole("button", { name: /Pause live updates/ }));
    await view.findByRole("button", { name: "Resume", exact: true });
    expect(liveRegion.textContent).toBe(original);
    await user.click(view.getByRole("button", { name: "Resume", exact: true }));
    await vi.waitFor(() =>
      expect(view.container.querySelector(".update-status")?.textContent).toContain("not updating"),
    );
    zone = "Pacific/Honolulu";
    await clock.advance(60);
    expect(liveRegion.isConnected).toBe(true);
    expect(liveRegion.textContent).toBe(original);
    expect(mutations).toEqual([]);
    server.status(syntheticStop("source.unreadable", { code: "permission" }));
    await vi.waitFor(() => expect(liveRegion.textContent).toContain("permission denied"));
    expect(mutations).toHaveLength(1);
    server.status(null);
    await vi.waitFor(() => expect(liveRegion.textContent).toBe("Up to date again"));
    expect(mutations).toHaveLength(2);
  } finally {
    observer?.disconnect();
    cleanup();
    await engine.dispose();
    await server.dispose();
    vi.unstubAllGlobals();
  }
});
