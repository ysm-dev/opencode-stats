import { cleanup, render } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import {
  inMemoryDashboardServer,
  syntheticCopy,
  syntheticStop,
} from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, manualClock } from "@opencode-stats/engine/testing";
import { Dashboard } from "./dashboard.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";
import { accessible } from "./testing/accessibility.ts";

it.each([
  { stop: syntheticStop(), text: "run bunx opencode-stats@latest" },
  {
    stop: syntheticStop("schema.newer", { mode: "plugin" }),
    text: "run opencode plugin update opencode-stats",
  },
  { stop: syntheticStop("schema.v1"), text: "opening it once with OpenCode v2 upgrades it" },
  {
    stop: syntheticStop("source.unreadable", { code: "permission" }),
    text: "can't read OpenCode's database: permission denied",
  },
  { stop: syntheticStop("source.locked"), text: "OpenCode's database has been locked since" },
  {
    stop: syntheticStop("store.unwritable", { code: "full" }),
    text: "can't save statistics in ~/.cache/opencode-stats: the disk is full",
  },
])(
  "a first-run $stop.reason problem explains the reason and fix before today is ready, then returns automatically",
  async ({ stop, text }) => {
    dashboardEnvironment("/?range=all");
    const server = inMemoryDashboardServer(
      syntheticCopy([], { revision: 0, historyComplete: false, historyCompleteFrom: 0 }),
    );
    server.status(stop);
    const engine = inThreadEngine(server.fetch, queueMicrotask, manualClock());
    const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
    try {
      await view.findByRole("heading", { name: "Can't load the dashboard" });
      expect(view.getByRole("status").textContent).toContain(text);
      expect(view.queryByText("Reload to try again.")).toBeNull();
      expect(view.queryByRole("region", { name: "Tokens" })).toBeNull();
      expect(
        view.container.querySelector("[data-problem-state]")?.getAttribute("data-sync-reason"),
      ).toBe(stop.reason);
      await accessible(view.container);
      server.commit(
        syntheticCopy(
          [{ start: 1, input: 10, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }],
          { revision: 1 },
        ),
      );
      server.status(null);
      await view.findByRole("heading", { name: "Overview" });
      expect(view.container.querySelector("[data-problem-state]")).toBeNull();
    } finally {
      cleanup();
      await engine.dispose();
      await server.dispose();
      vi.unstubAllGlobals();
    }
  },
);
