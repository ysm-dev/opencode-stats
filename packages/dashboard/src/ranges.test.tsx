import { render, cleanup, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { inThreadEngine, manualClock } from "@opencode-stats/engine/testing";
import { inMemoryDashboardServer, syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { Dashboard } from "./dashboard.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";

beforeEach(() => {
  dashboardEnvironment("/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const step = (date: string, input: number, session: number) => ({
  start: Date.parse(date),
  input,
  session,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
});
const rangesDashboard = (deliverAnswer: (deliver: () => void) => void = queueMicrotask) => {
  const server = inMemoryDashboardServer(
    syntheticCopy([
      step("2026-10-01T12:00Z", 1, 0),
      step("2026-10-06T12:00Z", 50, 1),
      step("2026-10-06T13:00Z", 50, 2),
      step("2026-10-07T12:00Z", 112, 3),
    ]),
  );
  const clock = manualClock();
  const engine = inThreadEngine(server.fetch, deliverAnswer, clock);
  const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
  const user = userEvent.setup();
  const close = async () => {
    cleanup();
    await engine.dispose();
    await server.dispose();
  };
  return { server, engine, clock, view, user, close };
};

const chooseRange = async (f: ReturnType<typeof rangesDashboard>, label: string) => {
  await f.user.click(f.view.getByRole("button", { name: /^Time range/ }));
  await f.user.click(await screen.findByRole("option", { name: label, exact: true }));
};

it("opens fresh on Last 30 days and paints range controls, titles, muted comparisons and captions without a request or announcement", async () => {
  const f = rangesDashboard();
  try {
    const select = await f.view.findByRole("button", { name: /^Time range/ });
    expect(select.textContent).toBe("Last 30 days");
    expect(window.location.search).toBe("?range=30d");
    expect(document.title).toBe("Overview · Last 30 days · opencode-stats");
    const tokens = f.view.getByRole("region", { name: "Tokens" });
    const number = tokens.querySelector(".headline-number");
    expect(number?.textContent).toBe("213");
    const next = f.view.getByRole("button", { name: "Next range" });
    expect(next.hasAttribute("disabled")).toBe(true);
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    const requests = f.server.requests;
    await chooseRange(f, "Today");
    await vi.waitFor(() => expect(number?.textContent).toBe("112"));
    expect(document.title).toBe("Overview · Today · opencode-stats");
    expect(tokens.querySelector(".previous-period")?.textContent).toContain("↑ 12%");
    const sessions = f.view.getByRole("region", { name: "Sessions" });
    expect(sessions.querySelector(".previous-period")?.textContent).toContain("↓ 50%");
    expect(tokens.textContent).toContain(
      "Previous period · 6 Oct 2026 – 6 Oct 2026 · through 14:02",
    );
    expect(f.view.getByRole("status").textContent).toBe("");
    expect(f.server.requests).toBe(requests);
    expect(
      new Set(
        [...f.view.container.querySelectorAll("[data-range]")].map((region) =>
          region.getAttribute("data-range"),
        ),
      ),
    ).toEqual(new Set(["/?range=today"]));
    const results = await axe.run(f.view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    expect(results.incomplete).toEqual([]);
  } finally {
    await f.close();
  }
});

it("shifts, returns to live presets, removes fixed chips and restores Back and Forward from the address", async () => {
  const f = rangesDashboard();
  try {
    const select = await f.view.findByRole("button", { name: /^Time range/ });
    await chooseRange(f, "Today");
    await f.user.click(f.view.getByRole("button", { name: "Previous range" }));
    const fixed = "/?range=fixed&from=2026-10-06&to=2026-10-06";
    await vi.waitFor(() => expect(window.location.pathname + window.location.search).toBe(fixed));
    const chip = f.view.getByRole("button", {
      name: "Remove fixed range · 6 Oct 2026 – 6 Oct 2026",
    });
    expect(document.title).toBe("Overview · 6 Oct 2026 – 6 Oct 2026 · opencode-stats");
    await f.user.click(f.view.getByRole("button", { name: "Next range" }));
    await vi.waitFor(() => expect(window.location.search).toBe("?range=today"));
    expect(chip.isConnected).toBe(false);
    expect(document.activeElement).toBe(select);
    window.history.back();
    await vi.waitFor(() =>
      expect(f.view.container.querySelector(".fixed-range")?.textContent).toContain("6 Oct 2026"),
    );
    expect(
      f.view.getByRole("region", { name: "Tokens" }).querySelector(".headline-number")?.textContent,
    ).toBe("100");
    window.history.forward();
    await vi.waitFor(() => expect(f.view.container.querySelector(".fixed-range")).toBeNull());
    expect(document.title).toBe("Overview · Today · opencode-stats");
    await f.user.click(f.view.getByRole("button", { name: "Previous range" }));
    await f.user.click(await f.view.findByRole("button", { name: /Remove fixed range/ }));
    await vi.waitFor(() => expect(window.location.search).toBe("?range=today"));
    expect(document.activeElement).toBe(select);
    await chooseRange(f, "All time");
    await vi.waitFor(() => expect(document.title).toBe("Overview · All time · opencode-stats"));
    expect(f.view.getByRole("button", { name: "Previous range" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(f.view.getByRole("button", { name: "Next range" }).hasAttribute("disabled")).toBe(true);
    expect(f.view.container.querySelectorAll(".previous-period")).toHaveLength(0);
    expect(f.server.requests).toBe(2);
  } finally {
    await f.close();
  }
});

it("restores a bookmarked fixed range without changing its local dates or losing the chip on reload", async () => {
  window.history.replaceState(null, "", "/?range=fixed&from=2026-10-06&to=2026-10-06");
  const f = rangesDashboard();
  try {
    expect(
      await f.view.findByRole("button", { name: /Remove fixed range · 6 Oct 2026/ }),
    ).toBeTruthy();
    expect(
      f.view.getByRole("region", { name: "Tokens" }).querySelector(".headline-number")?.textContent,
    ).toBe("100");
    expect(window.location.search).toBe("?range=fixed&from=2026-10-06&to=2026-10-06");
    expect(f.view.getByRole("button", { name: /^Time range/ }).textContent).toBe("Today");
  } finally {
    await f.close();
  }
});

it("keeps the published Select controlled until the complete engine answer is delivered", async () => {
  let holding = false;
  const deliveries: (() => void)[] = [];
  const f = rangesDashboard((deliver) => {
    if (holding) deliveries.push(deliver);
    else queueMicrotask(deliver);
  });
  try {
    const trigger = await f.view.findByRole("button", { name: /^Time range/ });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    holding = true;
    await chooseRange(f, "Today");
    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    expect(trigger.textContent).toBe("Last 30 days");
    expect(window.location.search).toBe("?range=30d");
    expect(document.title).toBe("Overview · Last 30 days · opencode-stats");
    expect(f.view.container.querySelector(".headline-number")?.textContent).toBe("213");
    deliveries[0]!();
    expect(trigger.textContent).toBe("Today");
    expect(f.view.container.querySelector(".headline-number")?.textContent).toBe("112");
    expect(window.location.search).toBe("?range=today");
    expect(f.server.requests).toBe(2);
  } finally {
    await f.close();
  }
});

it("offers all published Select options, keeps repeated selections and supports keyboard selection and Escape focus", async () => {
  const f = rangesDashboard();
  try {
    const trigger = await f.view.findByRole("button", { name: /^Time range/ });
    await f.user.click(trigger);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Today",
      "Last 7 days",
      "Last 30 days",
      "Last 90 days",
      "Last 180 days",
      "Last 365 days",
      "All time",
    ]);
    await f.user.click(screen.getByRole("option", { name: "Last 30 days", exact: true }));
    expect(trigger.textContent).toBe("Last 30 days");
    expect(window.location.search).toBe("?range=30d");
    await f.user.click(trigger);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("option", { name: "Last 30 days", exact: true }),
      ),
    );
    await f.user.keyboard("{Home}{Enter}");
    await vi.waitFor(() => expect(trigger.textContent).toBe("Today"));
    await f.user.click(trigger);
    await f.user.keyboard("{Escape}");
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("option")).toBeNull();
    expect(f.view.getByRole("status").textContent).toBe("");
  } finally {
    await f.close();
  }
});
