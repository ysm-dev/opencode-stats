import { cleanup, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { filterCopy, filterSteps, filterMetadata } from "@opencode-stats/engine/testing";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";

beforeEach(() => dashboardEnvironment("/?range=7d"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const surface = () => document.querySelector<HTMLElement>(".chart-hit")!;
const readout = () => document.querySelector<HTMLElement>(".chart-readout")!;
const fixture = async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  return f;
};
const focusReadingAction = async (f: Awaited<ReturnType<typeof fixture>>, clear: boolean) => {
  surface().focus();
  await f.user.keyboard("{End}");
  await f.user.tab();
  if (clear) await f.user.tab();
  expect(document.activeElement).toBe(
    within(readout()).getByRole("button", { name: clear ? "Clear chart reading" : "Drill in" }),
  );
};
const localMark = () => {
  const mark = readout().getAttribute("data-local-state");
  expect(surface().getAttribute("data-local-state")).toBe(mark);
  expect(surface().querySelector("svg")!.getAttribute("data-local-state")).toBe(mark);
  return mark;
};

it.each([
  ["live", false],
  ["live", true],
  ["minute", false],
  ["minute", true],
] as const)(
  "%s answers return focus from a disappearing reading action (clear=%s)",
  async (kind, clear) => {
    const f = await fixture();
    await focusReadingAction(f, clear);
    const focused = document.activeElement!;
    if (kind === "live") {
      f.server.commit({ ...filterCopy(), revision: 2 });
    } else await f.clock.advance(60);
    await vi.waitFor(() =>
      expect(document.querySelector(`[data-revision="${kind === "live" ? 2 : 1}"]`)).not.toBeNull(),
    );
    expect(focused.isConnected).toBe(false);
    expect(document.activeElement).toBe(surface());
    expect(readout().textContent).toContain("Range totals");
    localMark();
  },
);

it.each([false, true])(
  "mouse leave returns focus from a disappearing reading action (clear=%s) without a query",
  async (clear) => {
    const f = await fixture();
    const section = document.querySelector<HTMLElement>(".usage-chart")!;
    await f.user.hover(section);
    await focusReadingAction(f, clear);
    const requests = f.server.requests;
    const address = window.location.href;
    const mark = localMark();
    await f.user.unhover(section);
    expect(document.activeElement).toBe(surface());
    expect(readout().textContent).toContain("Range totals");
    expect(localMark()).not.toBe(mark);
    expect(f.server.requests).toBe(requests);
    expect(window.location.href).toBe(address);
  },
);

it("pointer departures restore the focused series, and blur preserves a different hovered series", async () => {
  const f = await fixture();
  await f.user.click(f.view.getByRole("button", { name: /^Chart split/ }));
  await f.user.click(await f.view.findByRole("option", { name: "model" }));
  await vi.waitFor(() => expect(surface().getAttribute("aria-label")).toContain("by model"));
  const series = [...readout().querySelectorAll<HTMLButtonElement>("li button")];
  const assertHighlight = (index: number | null) => {
    expect(series.map((button) => button.getAttribute("aria-pressed"))).toEqual(
      series.map((_, position) => String(position === index)),
    );
    for (const position of [0, 1]) {
      const segments = [
        ...surface().querySelectorAll(`rect[fill="var(--dashboard-series-${position + 1})"]`),
      ];
      expect(segments.length).toBeGreaterThan(0);
      expect(
        segments.every(
          (segment) =>
            Number(segment.getAttribute("fill-opacity")) ===
            (index === null || index === position ? 0.45 : 0.11),
        ),
      ).toBe(true);
    }
    localMark();
  };
  const requests = f.server.requests;
  const global = surface().getAttribute("data-state");
  surface().focus();
  await f.user.tab();
  expect(document.activeElement).toBe(series[0]);
  await f.user.hover(series[0]!);
  const beforeLeave = localMark();
  await f.user.unhover(series[0]!);
  assertHighlight(0);
  expect(localMark()).not.toBe(beforeLeave);
  await f.user.hover(series[1]!);
  assertHighlight(1);
  await f.user.unhover(series[1]!);
  assertHighlight(0);
  await f.user.hover(series[1]!);
  await f.user.tab();
  expect(document.activeElement).toBe(series[1]);
  await f.user.unhover(series[1]!);
  assertHighlight(1);
  await f.user.tab({ shift: true });
  await f.user.hover(series[1]!);
  surface().focus();
  assertHighlight(1);
  await f.user.unhover(series[1]!);
  assertHighlight(null);
  expect(surface().getAttribute("data-state")).toBe(global);
  expect(f.server.requests).toBe(requests);
});

it.each(["pointer", "focus"] as const)(
  "a live answer removes the active %s series and restores its surviving counterpart",
  async (source) => {
    const f = await fixture();
    await f.user.click(f.view.getByRole("button", { name: /^Chart split/ }));
    await f.user.click(await f.view.findByRole("option", { name: "model" }));
    await vi.waitFor(() => expect(surface().getAttribute("aria-label")).toContain("by model"));
    const buttons = [...readout().querySelectorAll<HTMLButtonElement>("li button")];
    surface().focus();
    await f.user.tab();
    if (source === "pointer") await f.user.hover(buttons[1]!);
    else {
      await f.user.hover(buttons[0]!);
      await f.user.tab();
    }
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
    f.server.commit(
      syntheticCopy(
        filterSteps.filter((step) => step.model === 6),
        { ...filterMetadata, revision: 2 },
      ),
    );
    await vi.waitFor(() => expect(readout().querySelectorAll("li button")).toHaveLength(1));
    expect(buttons[0]!.isConnected).toBe(true);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(source === "pointer" ? buttons[0] : surface());
    localMark();
  },
);
