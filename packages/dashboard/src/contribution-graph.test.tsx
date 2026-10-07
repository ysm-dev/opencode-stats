import { cleanup, fireEvent, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";
import { accessible } from "./testing/accessibility.ts";
import { initialMedia } from "./media-size.tsx";
import { createSignal } from "solid-js";

beforeEach(() => {
  dashboardEnvironment("/?range=today");
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const rows = Array.from({ length: 7 }, (_, index) => ({
  start: Date.UTC(2026, 9, index + 1, 12),
  input: index * 100,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
  estimatedCost: index === 3 ? null : index,
  recordedCost: 0,
}));
const surface = async (view: ReturnType<typeof dashboardFixture>["view"]) => {
  const svg = await view.findByRole("img", { name: "Contribution graph, past 365 local days" });
  const width = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, 176));
  return svg;
};
const pointer = (
  svg: HTMLElement,
  node: Element,
  pointerType: string,
  type = "pointerup",
  button = 0,
) => {
  const rect = node.tagName.toLowerCase() === "rect";
  const event = new Event(type, { bubbles: true });
  const label = node instanceof HTMLElement ? node : undefined;
  Object.assign(event, {
    pointerType,
    button,
    clientX: label
      ? (Number.parseFloat(label.style.left) * svg.getBoundingClientRect().width) / 100
      : Number(node.getAttribute("x")) + 6.5,
    clientY: rect
      ? Number(node.getAttribute("y")) + 6.5
      : node.hasAttribute("data-month")
        ? 12
        : 160,
  });
  fireEvent(svg, event);
};
const marks = () =>
  new Set(
    [...document.querySelectorAll("[data-state]")].map((node) => node.getAttribute("data-state")),
  );

it("draws Monday-first 365-day geometry, outlines only the range, and presents ten headlines and accessible readouts", async () => {
  await using f = dashboardFixture(syntheticCopy(rows));
  const svg = await surface(f.view);
  expect(svg.querySelectorAll("rect[data-date]")).toHaveLength(365);
  expect(svg.querySelector('[data-date="2025-10-07"]')).toBeNull();
  expect(svg.querySelector('[data-date="2026-10-08"]')).toBeNull();
  expect(svg.querySelector('[data-date="2026-10-05"]')!.getAttribute("y")).toBe("33.5");
  expect(svg.querySelector('[data-date="2026-10-04"]')!.getAttribute("y")).toBe("129.5");
  expect(svg.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
  expect(document.querySelectorAll(".headline-number")).toHaveLength(10);
  const headline = f.view.getByRole("region", { name: "Active days" });
  expect(headline.textContent).toContain("7 day current streak");
  expect(headline.querySelector(".headline-number")!.textContent).toBe("1");
  pointer(svg, svg.querySelector('[data-date="2026-10-01"]')!, "touch");
  const readout = document.querySelector<HTMLElement>(".graph-readout")!;
  expect(readout.textContent).toContain("Thu, 1 Oct 2026 · 0 tokens");
  expect(within(readout).getByRole("button", { name: "Week 40" })).toBeTruthy();
  expect(window.location.search).toBe("?range=today");
  await accessible();
  await f.engine.client.request({ kind: "all-time" });
  await vi.waitFor(() => expect(svg.querySelectorAll('[data-selected="true"]')).toHaveLength(7));
  await f.engine.client.request({ kind: "preset", preset: "365d" });
  await vi.waitFor(() => expect(svg.querySelectorAll('[data-selected="true"]')).toHaveLength(0));
  expect(marks().size).toBe(1);
});

it("keeps the graph one Tab stop; arrows read by day/week, Home and End clamp, Enter selects, and actions follow it", async () => {
  await using f = dashboardFixture(syntheticCopy(rows));
  const svg = await surface(f.view);
  svg.focus();
  await f.user.keyboard("{ArrowLeft}{ArrowUp}{ArrowDown}{ArrowRight}");
  expect(document.querySelector(".graph-readout")!.textContent).toContain("7 Oct 2026");
  await f.user.keyboard("{ArrowDown}");
  expect(document.querySelector(".graph-readout")!.textContent).toContain("7 Oct 2026");
  await f.user.keyboard("{Home}{ArrowUp}{ArrowLeft}");
  expect(document.querySelector(".graph-readout")!.textContent).toContain("8 Oct 2025");
  await f.user.keyboard("{End}{ArrowUp}{Enter}");
  await vi.waitFor(() =>
    expect(window.location.search).toContain("from=2026-10-06&to=2026-10-06&kind=day"),
  );
  expect(document.activeElement).toBe(svg);
  await f.user.tab();
  expect(document.activeElement).toBe(
    within(document.querySelector<HTMLElement>(".graph-readout")!).getByRole("button", {
      name: "This day",
    }),
  );
  await f.user.tab();
  await f.user.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(window.location.search).toContain("from=2026-10-05&to=2026-10-11&kind=week"),
  );
  await f.user.tab();
  await f.user.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(window.location.search).toContain("from=2026-10-01&to=2026-10-31&kind=month"),
  );
  await f.user.click(f.view.getByRole("button", { name: "Clear readout" }));
  expect(document.activeElement).toBe(svg);
  expect(document.querySelector(".graph-readout")!.textContent).toContain("Point, tap");
  await f.user.keyboard("x{ArrowLeft}{Escape}");
  expect(f.view.queryByRole("button", { name: "This day" })).toBeNull();
  // With nothing read, Enter selects today and normalizes back to its preset.
  await f.user.keyboard("{Enter}");
  await vi.waitFor(() => expect(window.location.search).toBe("?range=today"));
});

it("uses one nearest-hit surface, including gaps, and decides tap-versus-mouse per pointer event", async () => {
  await using f = dashboardFixture(syntheticCopy(rows));
  const svg = await surface(f.view);
  const oct1 = svg.querySelector('[data-date="2026-10-01"]')!;
  pointer(svg, oct1, "mouse", "pointermove");
  pointer(svg, oct1, "mouse", "pointermove");
  expect(document.querySelector(".graph-readout")!.textContent).toContain("1 Oct 2026");
  expect(window.location.search).toBe("?range=today");
  pointer(svg, oct1, "touch");
  pointer(svg, oct1, "pen");
  pointer(svg, oct1, "mouse", "pointerup", 2);
  expect(window.location.search).toBe("?range=today");
  pointer(svg, oct1, "mouse");
  await vi.waitFor(() => expect(window.location.search).toContain("from=2026-10-01&to=2026-10-01"));
  pointer(svg, document.querySelector('[data-week="2026-09-28"]')!, "mouse");
  await vi.waitFor(() =>
    expect(window.location.search).toContain("from=2026-09-28&to=2026-10-04&kind=week"),
  );
  pointer(svg, document.querySelector('[data-month="2026-09-01"]')!, "mouse");
  await vi.waitFor(() =>
    expect(window.location.search).toContain("from=2026-09-01&to=2026-09-30&kind=month"),
  );
  const gap = new Event("pointerup", { bubbles: true });
  Object.assign(gap, {
    pointerType: "touch",
    clientX: Number(oct1.getAttribute("x")) - 1,
    clientY: Number(oct1.getAttribute("y")) + 8,
    button: 0,
  });
  fireEvent(svg, gap);
  expect(document.querySelector(".graph-readout")!.textContent).toContain("1 Oct 2026");
  expect(marks().size).toBe(1);
  const graph = document.querySelector(".contribution-graph")!;
  expect(
    [...graph.querySelectorAll("[data-local-state]")].every(
      (node) => node.getAttribute("data-local-state") === graph.getAttribute("data-local-state"),
    ),
  ).toBe(true);
});

it("keeps Tokens/Steps/estimated Cost in the URL, distinguishes free from unavailable, and makes approximations accessible", async () => {
  await using f = dashboardFixture(syntheticCopy(rows));
  const svg = await surface(f.view);
  const metric = within(f.view.getByRole("group", { name: "Contribution metric" }));
  await f.user.click(metric.getByRole("button", { name: "Steps" }));
  await vi.waitFor(() => expect(window.location.search).toContain("graph=steps"));
  pointer(svg, svg.querySelector('[data-date="2026-10-01"]')!, "touch");
  expect(document.querySelector(".graph-readout")!.textContent).toContain("1 steps");
  await f.user.click(metric.getByRole("button", { name: "Cost" }));
  await vi.waitFor(() => expect(window.location.search).toContain("graph=cost"));
  const readout = document.querySelector(".graph-readout")!;
  expect(readout.querySelector('[aria-hidden="true"]')!.textContent).toBe("≈ $0 estimated cost");
  expect(readout.querySelector(".sr-only")!.textContent).toBe("about $0 estimated cost");
  expect(readout.textContent).toContain("— of tokens priced");
  expect(svg.querySelector('[data-date="2026-10-01"]')!.getAttribute("data-level")).toBe("1");
  pointer(svg, svg.querySelector('[data-date="2026-10-04"]')!, "touch");
  expect(readout.textContent).toContain("Unavailable estimated cost · 0% of tokens priced");
  expect(svg.querySelector('[data-date="2026-10-04"]')!.getAttribute("data-level")).toBe("-1");
  svg.focus();
  await f.user.keyboard("{End}{ArrowUp}{ArrowUp}{ArrowUp}");
  expect(
    document.querySelector('.contribution-graph [aria-live="polite"][data-local-state]')!
      .textContent,
  ).toContain("Unavailable estimated cost");
  pointer(svg, svg.querySelector('[data-date="2026-10-05"]')!, "touch");
  expect(readout.textContent).toContain("100% of tokens priced");
  await accessible();
  await f.user.click(metric.getByRole("button", { name: "Tokens" }));
  await vi.waitFor(() => expect(window.location.search).not.toContain("graph="));
});

it("holds drawn metric/selection state while answers wait and never announces live values", async () => {
  let held = false;
  const answers: Array<() => void> = [];
  await using f = dashboardFixture(syntheticCopy(rows), (deliver) =>
    held ? answers.push(deliver) : queueMicrotask(deliver),
  );
  const svg = await surface(f.view);
  const metric = within(f.view.getByRole("group", { name: "Contribution metric" }));
  held = true;
  const before = document.querySelector(".contribution-graph")!.getAttribute("data-state");
  await f.user.click(metric.getByRole("button", { name: "Cost" }));
  await vi.waitFor(() => expect(answers).toHaveLength(1));
  expect(metric.getByRole("button", { name: "Tokens" }).getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector(".contribution-graph")!.getAttribute("data-state")).toBe(before);
  answers.shift()!();
  await vi.waitFor(() =>
    expect(metric.getByRole("button", { name: "Cost" }).getAttribute("aria-pressed")).toBe("true"),
  );
  expect(marks().size).toBe(1);
  held = false;
  svg.focus();
  await f.user.keyboard("{ArrowUp}");
  const spoken = document.querySelector(
    '.contribution-graph [aria-live="polite"][data-local-state]',
  )!;
  expect(spoken.textContent).toContain("about $5 estimated cost");
  const announced = spoken.textContent;
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy(
      rows.map((row) => ({ ...row, estimatedCost: 9 })),
      { revision: 2 },
    ),
  );
  await vi.waitFor(() =>
    expect(document.querySelector(".graph-readout")!.textContent).toContain("$9 estimated cost"),
  );
  expect(spoken.textContent).toBe(announced);
  expect(marks().size).toBe(1);
});

it("opens sideways scrolling at today and scrolls keyboard reading into view", async () => {
  const descriptors = ["scrollWidth", "clientWidth"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
  );
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => 848,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 240,
  });
  try {
    await using f = dashboardFixture(syntheticCopy(rows), queueMicrotask, () => ({
      ...initialMedia,
      columnWidth: 360,
    }));
    const svg = await surface(f.view);
    const scroll = document.querySelector<HTMLElement>(".graph-scroll")!;
    expect(scroll.scrollLeft).toBe(848);
    svg.focus();
    await f.user.keyboard("{Home}");
    expect(scroll.scrollLeft).toBe(0);
    await f.user.keyboard("{End}");
    expect(scroll.scrollLeft).toBeGreaterThan(0);
    const before = scroll.scrollLeft;
    await f.user.keyboard("{ArrowUp}");
    expect(scroll.scrollLeft).toBe(before);
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }
  }
});

it("keeps focused readout actions and their nearest day when the local-day window moves", async () => {
  await using f = dashboardFixture(
    syntheticCopy(rows),
    queueMicrotask,
    undefined,
    undefined,
    Date.parse("2026-10-07T23:59:59Z"),
  );
  const svg = await surface(f.view);
  svg.focus();
  await f.user.keyboard("{Home}");
  await f.user.tab();
  const action = f.view.getByRole("button", { name: "This day" });
  expect(document.activeElement).toBe(action);
  await f.clock.advance(2);
  await vi.waitFor(() =>
    expect(document.querySelector(".graph-readout")!.textContent).toContain("9 Oct 2025"),
  );
  expect(document.activeElement).toBe(action);
  expect(svg.querySelector('[data-reading="true"]')!.getAttribute("data-date")).toBe("2025-10-09");
  svg.focus();
  await f.user.keyboard("{End}");
  await f.clock.advance(-86400);
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() =>
    expect(svg.querySelector('[data-reading="true"]')!.getAttribute("data-date")).toBe(
      "2026-10-07",
    ),
  );
});

it("takes narrow and coarse forms from the shared media signals without recomputing engine data", async () => {
  const [media, setMedia] = createSignal(initialMedia);
  await using f = dashboardFixture(syntheticCopy(rows), queueMicrotask, media);
  await surface(f.view);
  const graph = document.querySelector(".contribution-graph")!;
  const global = graph.getAttribute("data-state");
  const local = graph.getAttribute("data-local-state");
  const answers = f.engine.answers.length;
  setMedia({
    ...initialMedia,
    columnWidth: 360,
    coarse: true,
    hover: false,
    desktop: false,
    forcedColours: true,
    short: true,
  });
  expect(graph.getAttribute("data-narrow")).toBe("true");
  expect(graph.getAttribute("data-coarse")).toBe("true");
  expect(graph.getAttribute("data-state")).toBe(global);
  expect(graph.getAttribute("data-local-state")).not.toBe(local);
  expect(f.engine.answers).toHaveLength(answers);
  setMedia(initialMedia);
  expect(graph.getAttribute("data-narrow")).toBe("false");
  expect(graph.getAttribute("data-coarse")).toBe("false");
});
