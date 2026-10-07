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
import { initialMedia } from "./media-size.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";
import { accessible } from "./testing/accessibility.ts";

it("the status line, warning dot, announcement and numbers carry one whole state, with no unrequested toast or lost focus", async () => {
  dashboardEnvironment("/?range=all");
  const step = { start: 1, input: 10, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const server = inMemoryDashboardServer(syntheticCopy([step]));
  const clock = manualClock();
  const engine = inThreadEngine(server.fetch, queueMicrotask, clock);
  const view = render(() => (
    <Dashboard client={engine.client} ready={Promise.resolve()} media={() => initialMedia} />
  ));
  try {
    await view.findByRole("heading", { name: "Overview" });
    await vi.waitFor(() => expect(server.streams).toBe(1));
    const search = view.getByRole("searchbox", { name: "Search Model" });
    await userEvent.setup().click(search);
    server.status(syntheticStop());
    await vi.waitFor(() =>
      expect(view.container.querySelector(".update-status")?.textContent).toContain(
        "bunx opencode-stats@latest",
      ),
    );
    const line = view.container.querySelector(".update-status")!;
    expect(line.getAttribute("data-warning")).toBe("true");
    expect(line.getAttribute("data-sync-reason")).toBe("schema.newer");
    expect(view.container.querySelector(".live-status")!.getAttribute("data-updating")).toBe(
      "false",
    );
    const marks = [...view.container.querySelectorAll("[data-state]")].map((node) =>
      node.getAttribute("data-state"),
    );
    expect(new Set(marks).size).toBe(1);
    expect(view.getByRole("region", { name: "Tokens" }).textContent).toBe("Tokens10");
    expect(document.activeElement).toBe(search);
    const announced = view.getAllByRole("status").map((node) => node.textContent);
    await clock.advance(2);
    expect(view.getAllByRole("status").map((node) => node.textContent)).toEqual(announced);
    server.commit(syntheticCopy([{ ...step, input: 20 }], { revision: 2 }));
    server.status(null);
    await vi.waitFor(() =>
      expect(view.getByRole("region", { name: "Tokens" }).textContent).toBe("Tokens20"),
    );
    expect(view.container.querySelector(".update-status")).toBeNull();
    expect(view.getAllByRole("status").map((node) => node.textContent)).toContain(
      "Up to date again",
    );
    expect(document.activeElement).toBe(search);
    await accessible(view.container);
  } finally {
    cleanup();
    await engine.dispose();
    await server.dispose();
    vi.unstubAllGlobals();
  }
});
