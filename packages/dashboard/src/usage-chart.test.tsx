import { cleanup, fireEvent, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { filterCopy, toolCopy, filterSteps, filterMetadata } from "@opencode-stats/engine/testing";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";
import { accessible } from "./testing/accessibility.ts";
import { initialMedia } from "./media-size.tsx";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";

beforeEach(() => dashboardEnvironment("/?range=7d"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const chart = () => document.querySelector<HTMLElement>(".chart-hit")!;
const readout = () => document.querySelector<HTMLElement>(".chart-readout")!;
const pointer = (type: string, pointerType: string, x: number, y = 0) => {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerType, clientX: x, clientY: y });
  fireEvent(type === "pointerleave" ? chart().closest(".usage-chart")! : chart(), event);
};
const bounds = () => {
  vi.spyOn(chart(), "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 360, 190));
};
const choose = async (f: ReturnType<typeof dashboardFixture>, control: string, value: string) => {
  await f.user.click(f.view.getByRole("button", { name: new RegExp(`^${control}`) }));
  await f.user.click(await screen.findByRole("option", { name: value }));
};
const readMetric = async (metric: string) => {
  const f = dashboardFixture(toolCopy());
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await choose(f, "Chart metric", metric);
  await vi.waitFor(() =>
    expect(chart().getAttribute("aria-label")).toContain(metric.replace("≈", "about")),
  );
  fireEvent.keyDown(chart(), { key: "Home" });
};

it("SVG uses the palette without motion, fits all buckets at 360px/190px, and exposes one chart tab stop with an accessible readout", async () => {
  const [media, setMedia] = createSignal({ ...initialMedia, columnWidth: 360, coarse: true });
  const f = dashboardFixture(filterCopy(), queueMicrotask, media);
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Usage over time" });
  expect(chart().getAttribute("aria-label")).toBe("Tokens by token kind, Last 7 days, by day");
  expect(chart().tabIndex).toBe(0);
  const svg = chart().querySelector("svg")!;
  expect(svg.getAttribute("viewBox")).toBe("0 0 360 190");
  expect(chart().querySelectorAll('[tabindex="0"]')).toHaveLength(0);
  expect(svg.innerHTML).toContain("var(--dashboard-kind-input)");
  const partials = [...svg.querySelectorAll("rect")].filter(
    (node) => node.getAttribute("fill-opacity") === "0.45",
  );
  expect(partials.length).toBeGreaterThan(0);
  expect(
    partials.every(
      (node) =>
        node.getAttribute("stroke-width") === "1" &&
        node.getAttribute("stroke") === node.getAttribute("fill"),
    ),
  ).toBe(true);
  expect(svg.querySelectorAll("animate, animateTransform")).toHaveLength(0);
  expect(readout().textContent).toContain("Range totals");
  expect(readout().textContent).toContain("Total · 3,080");
  expect(document.querySelector(".chart-spoken")!.textContent).toBe("");
  const requests = f.server.requests;
  setMedia({ ...media(), columnWidth: 1280, coarse: false });
  expect(chart().querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 1280 260");
  const drawnSize = chart().querySelector("svg")!.getAttribute("data-size-state");
  setMedia({ ...media(), coarse: true, forcedColours: true });
  expect(chart().querySelector("svg")!.getAttribute("data-size-state")).toBe(drawnSize);
  expect(chart().getAttribute("data-size-state")).toBe(drawnSize);
  expect(f.server.requests).toBe(requests);
  const group = f.view.getByRole("group", { name: "Chart metric" });
  expect(within(group).getByRole("button", { name: "Tokens" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  await accessible(f.view.container);
});

it("keyboard reads nearest bounds, announces only that bucket, drills a fixed day, clears and preserves focus", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  chart().focus();
  fireEvent.keyDown(chart(), { key: "ArrowLeft" });
  expect(readout().textContent).toContain("partial");
  expect(document.querySelector(".chart-spoken")!.textContent).toContain("Input: 2,800");
  fireEvent.keyDown(chart(), { key: "ArrowRight" });
  fireEvent.keyDown(chart(), { key: "Home" });
  expect(readout().textContent).toContain("1 Oct 2026");
  fireEvent.keyDown(chart(), { key: "ArrowLeft" });
  expect(readout().textContent).toContain("1 Oct 2026");
  fireEvent.keyDown(chart(), { key: "ArrowRight" });
  expect(readout().textContent).toContain("2 Oct 2026");
  fireEvent.keyDown(chart(), { key: "Escape" });
  expect(readout().textContent).toContain("Range totals");
  fireEvent.keyDown(chart(), { key: "Enter" });
  fireEvent.keyDown(chart(), { key: "ArrowRight" });
  fireEvent.keyDown(chart(), { key: "End" });
  fireEvent.keyDown(chart(), { key: "q" });
  fireEvent.keyDown(chart(), { key: "Enter" });
  await vi.waitFor(() => expect(chart().getAttribute("aria-label")).toContain("by hour"));
  expect(window.location.search).toBe("?range=fixed&from=2026-10-07&to=2026-10-07&kind=day");
  expect(document.activeElement).toBe(chart());
  fireEvent.keyDown(chart(), { key: "Home" });
  expect(within(readout()).queryByRole("button", { name: "Drill in" })).toBeNull();
  fireEvent.keyDown(chart(), { key: "Enter" });
  await f.user.click(within(readout()).getByRole("button", { name: "Clear chart reading" }));
  expect(document.activeElement).toBe(chart());
  expect(readout().textContent).toContain("Range totals");
});

it("decides tap versus action per event, reads horizontal finger drags, allows vertical scroll and ignores cancelled gestures", async () => {
  const f = dashboardFixture(filterCopy(), queueMicrotask, () => ({
    ...initialMedia,
    columnWidth: 360,
  }));
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  bounds();
  const requests = f.server.requests;
  pointer("pointermove", "mouse", 80);
  expect(readout().textContent).toContain("1 Oct 2026");
  expect(document.querySelector(".chart-spoken")!.textContent).toBe("");
  pointer("pointerleave", "mouse", 80);
  expect(readout().textContent).toContain("Range totals");
  pointer("pointermove", "touch", 80);
  pointer("pointerup", "touch", 80);
  expect(readout().textContent).toContain("Range totals");
  pointer("pointerdown", "touch", 80);
  pointer("pointerup", "touch", 80);
  pointer("click", "touch", 80);
  fireEvent.click(chart(), { clientX: 80, clientY: 0 });
  expect(readout().textContent).toContain("1 Oct 2026");
  pointer("pointerleave", "touch", 80);
  expect(readout().textContent).toContain("1 Oct 2026");
  pointer("pointerdown", "touch", 80);
  pointer("pointermove", "touch", 200, 2);
  expect(readout().textContent).toContain("4 Oct 2026");
  pointer("pointermove", "touch", 354, 2);
  expect(readout().textContent).toContain("7 Oct 2026");
  pointer("pointerup", "touch", 354, 2);
  pointer("pointerdown", "touch", 80);
  pointer("pointermove", "touch", 81, 2);
  pointer("pointermove", "touch", 81, 50);
  pointer("pointermove", "touch", 120, 100);
  pointer("pointerup", "touch", 120, 100);
  expect(readout().textContent).toContain("7 Oct 2026");
  pointer("pointerdown", "pen", 80);
  pointer("pointercancel", "pen", 80);
  pointer("pointerup", "pen", 80);
  expect(readout().textContent).toContain("7 Oct 2026");
  expect(f.server.requests).toBe(requests);
  pointer("pointerdown", "mouse", -100);
  pointer("pointerup", "mouse", -100);
  pointer("click", "mouse", -100);
  await vi.waitFor(() => expect(chart().getAttribute("aria-label")).toContain("by hour"));
  expect(window.location.search).toContain("from=2026-10-01");
});

it("readout highlights by focus, pointer and tap and keeps top-six-plus-more in stack order", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await choose(f, "Chart split", "model");
  await vi.waitFor(() => expect(chart().getAttribute("aria-label")).toContain("by model"));
  const series = [...readout().querySelectorAll("li button")];
  expect(series).toHaveLength(7);
  expect(series[0]!.textContent).toContain("Model 6");
  expect(series.at(-1)!.textContent).toContain("1 more");
  const svg = chart().querySelector("svg")!;
  expect(svg.innerHTML).toContain("var(--dashboard-series-8)");
  const first = svg.querySelector('rect[fill="var(--dashboard-series-1)"]')!;
  const second = svg.querySelector('rect[fill="var(--dashboard-series-2)"]')!;
  expect(Number(first.getAttribute("y"))).toBeLessThan(Number(second.getAttribute("y")));
  fireEvent.pointerEnter(series[0]!);
  expect(series[0]!.getAttribute("aria-pressed")).toBe("true");
  fireEvent.pointerLeave(series[0]!);
  expect(series[0]!.getAttribute("aria-pressed")).toBe("false");
  fireEvent.focus(series[1]!);
  expect(series[1]!.getAttribute("aria-pressed")).toBe("true");
  fireEvent.blur(series[1]!);
  await f.user.click(series[2]!);
  expect(series[2]!.getAttribute("aria-pressed")).toBe("true");
  expect(
    [...chart().querySelectorAll("rect")].some((node) => {
      const opacity = Number(node.getAttribute("fill-opacity"));
      return opacity > 0 && opacity < 0.2;
    }),
  ).toBe(true);
  await accessible(f.view.container);
});

it("metric and split switches remain controlled until the full answer, then survive reloads without default URL parameters", async () => {
  const deliveries: (() => void)[] = [];
  let hold = false;
  const f = dashboardFixture(toolCopy(), (deliver) =>
    hold ? deliveries.push(deliver) : queueMicrotask(deliver),
  );
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  hold = true;
  await choose(f, "Chart metric", "Tool calls");
  await vi.waitFor(() => expect(deliveries).toHaveLength(1));
  expect(chart().getAttribute("aria-label")).toContain("Tokens");
  expect(window.location.search).not.toContain("metric=tools");
  deliveries.shift()!();
  await vi.waitFor(() => expect(chart().getAttribute("aria-label")).toContain("Tool calls"));
  hold = false;
  await choose(f, "Chart split", "provider");
  await vi.waitFor(() => expect(window.location.search).toContain("metric=tools&split=provider"));
  const address = window.location.href;
  await f.close();
  const reloaded = dashboardFixture(toolCopy());
  onTestFinished(reloaded.close);
  await reloaded.view.findByRole("heading", { name: "Overview" });
  expect(window.location.href).toBe(address);
  expect(chart().getAttribute("aria-label")).toContain("Tool calls by provider");
  await choose(reloaded, "Chart metric", "Tokens");
  await choose(reloaded, "Chart split", "token kind");
  await vi.waitFor(() => expect(window.location.search).toBe("?range=7d"));
});

it.each([
  "Sessions",
  "Cache hit rate",
  "Response time p50",
  "≈ Estimated cost",
  "Recorded cost",
  "Steps",
  "Prompts",
])("draws %s with exact totals, missing values and the bucket's own basis", async (metric) => {
  await readMetric(metric);
});

it.each([
  ["Response time p50", "Total · —"],
  ["Response time p50", "of steps timed"],
  ["≈ Estimated cost", "of tokens priced"],
  ["Cache hit rate", "50%"],
] as const)("%s reads its own %s", async (metric, text) => {
  await readMetric(metric);
  expect(readout().textContent).toContain(text);
});

it("response time draws an unsplit line even with missing buckets", async () => {
  await readMetric("Response time p50");
  expect(chart().querySelectorAll("path").length).toBeGreaterThan(0);
});

it("wide segmented controls dispatch the same full-state choices", async () => {
  const f = dashboardFixture(filterCopy(), queueMicrotask, () => ({
    ...initialMedia,
    columnWidth: 1280,
  }));
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await f.user.click(
    within(f.view.getByRole("group", { name: "Chart metric" })).getByRole("button", {
      name: "Steps",
    }),
  );
  await vi.waitFor(() => expect(chart().getAttribute("aria-label")).toContain("Steps"));
  await f.user.click(
    within(f.view.getByRole("group", { name: "Chart split" })).getByRole("button", {
      name: "agent",
    }),
  );
  await vi.waitFor(() => expect(chart().getAttribute("aria-label")).toContain("by agent"));
});

it("estimated chart amounts keep the symbol and value together and expose the complete about text", async () => {
  const f = dashboardFixture(
    syntheticCopy([
      {
        start: Date.parse("2026-10-07T12:00Z"),
        input: 1000,
        cacheRead: 0,
        cacheWrite: 0,
        output: 1000,
        reasoning: 0,
        estimatedCost: 0.75,
        recordedCost: 0.12,
      },
    ]),
  );
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await choose(f, "Chart metric", "≈ Estimated cost");
  await vi.waitFor(() =>
    expect(readout().querySelector('.chart-total [aria-hidden="true"]')?.textContent).toBe(
      "≈ $0.75",
    ),
  );
  expect(readout().querySelector(".chart-total .sr-only")?.textContent).toBe("about $0.75");
  expect(
    [...readout().querySelectorAll("span")].some((node) => node.textContent?.trim() === "≈"),
  ).toBe(false);
  await accessible(f.view.container);
});

it("the published pickers cannot clear a metric or split when their current option is activated", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await choose(f, "Chart metric", "Tokens");
  await choose(f, "Chart split", "token kind");
  expect(chart().getAttribute("aria-label")).toContain("Tokens by token kind");
  expect(window.location.search).toBe("?range=7d");
});

it("responsive control switches retain keyboard focus in the same field without querying the worker", async () => {
  const [media, setMedia] = createSignal({ ...initialMedia, columnWidth: 1280 });
  const f = dashboardFixture(filterCopy(), queueMicrotask, media);
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  const requests = f.server.requests;
  for (const field of ["metric", "split"]) {
    within(f.view.getByRole("group", { name: `Chart ${field}` }))
      .getAllByRole("button")[0]!
      .focus();
    setMedia({ ...media(), columnWidth: 360 });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        f.view.getByRole("button", { name: new RegExp(`^Chart ${field}`) }),
      ),
    );
    setMedia({ ...media(), columnWidth: 1280 });
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true"),
    );
  }
  expect(f.server.requests).toBe(requests);
});

it("a bookmarked skipped local date draws an empty axis and all reads safely stay at rest", async () => {
  window.history.replaceState(null, "", "/?range=fixed&from=2011-12-30&to=2011-12-30");
  const f = dashboardFixture(syntheticCopy([]), queueMicrotask, () => initialMedia, "Pacific/Apia");
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  fireEvent.keyDown(chart(), { key: "Home" });
  pointer("pointermove", "mouse", 80);
  pointer("pointerup", "mouse", 80);
  expect(readout().textContent).toContain("Range totals");
  expect(document.querySelector(".chart-spoken")!.textContent).toBe("");
});

it("a live answer retains a focused series by ID, or returns focus to the chart when that series vanishes", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  await choose(f, "Chart split", "model");
  await vi.waitFor(() => expect(readout().querySelectorAll("li button")).toHaveLength(7));
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const focused = readout().querySelector<HTMLButtonElement>("li button")!;
  focused.focus();
  f.server.commit({ ...filterCopy(), revision: 2 });
  await vi.waitFor(() => expect(document.querySelector('[data-revision="2"]')).not.toBeNull());
  expect(document.activeElement).toBe(focused);
  expect(focused.getAttribute("aria-pressed")).toBe("true");
  f.server.commit(syntheticCopy([filterSteps[0]!], { ...filterMetadata, revision: 3 }));
  await vi.waitFor(() => expect(readout().querySelectorAll("li button")).toHaveLength(1));
  expect(document.activeElement).toBe(chart());
});
