import type { BrowserContext, Page } from "playwright";
import { expect } from "vitest";
import { tourWork } from "./tour-evidence.ts";
import {
  readChangeEvidence,
  assertSummedMeasures,
  assertCleanChangeEvidence,
  type ChangeEvidence,
} from "./change-measures.ts";

export const wholePaintChecks = [
  "mixed-frame",
  "user-change-network",
  "early-load-paint",
  "animation",
] as const;
type Check = (typeof wholePaintChecks)[number];

// Installed synthetic pages only. Keep diagnostics to counters and named checks;
// snapshots are used for comparisons, never printed in failures or reports.
export function installWholePaintObserver(observing = true) {
  const page = document;
  const evidence = {
    failures: [] as string[],
    causes: [] as string[],
    samples: 0,
    blank: 0,
    complete: 0,
    raf: 0,
    rafCount: 0,
    work: { drawings: 0, readiness: 0, animations: 0, commit: 0 },
  };
  const fail = (check: string, cause = check) => {
    if (!evidence.failures.includes(check)) evidence.failures.push(check);
    if (!evidence.causes.includes(cause)) evidence.causes.push(cause);
  };
  type Drawing = { region: Element; key: string; drawing: string };
  let frame = {
    failures: [] as { check: string; cause: string }[],
    drawings: [] as Drawing[],
    drawn: false,
    complete: false,
  };
  const flag = (check: string, cause = check) => {
    frame.failures.push({ check, cause });
  };
  const regionSelectors = [
    ".chart-hit",
    ".chart-readout",
    ".chart-spoken",
    ".chart-choices",
    "svg",
    "html",
    ".settings-sheet",
    ".filter-checklist",
    ".filter-row",
    ".range-control",
    ".live-status",
    "header",
  ];
  const regionKind = (region: Element) =>
    regionSelectors.find((selector) => region.matches(selector)) ?? "other-region";
  const painted = new WeakMap<Element, { key: string; drawing: string }>();
  const retainDrawing = (region: Element, key: string, drawing: string) => {
    frame.drawings.push({ region, key, drawing });
  };
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes this entire observer into the browser without module bindings.
  const graphDrawing = (root: ParentNode) =>
    [
      ...root.querySelectorAll(".graph-plot, .graph-surface, .graph-surface rect, .graph-label"),
    ].map((node) => [...node.attributes].map((attribute) => [attribute.name, attribute.value]));
  const observeRegions = (regions: Element[]) => {
    for (const region of regions) {
      // This container contains several independent checklist search states.
      // Its own global mark is checked, and every checklist/row is checked below.
      if (region.classList.contains("filters")) continue;
      const local =
        region.getAttribute("data-local-state") ??
        region
          .closest(".filter-checklist, .contribution-graph")
          ?.getAttribute("data-local-state") ??
        "";
      const svg = region.matches("svg") ? region : region.querySelector("svg");
      retainDrawing(
        region,
        `${region.getAttribute("data-state")}/${local}/${region.getAttribute("data-media-state") ?? region.getAttribute("data-size-state") ?? ""}`,
        JSON.stringify({
          text: region.textContent,
          inputs: [...region.querySelectorAll<HTMLInputElement>("input")].map((input) => [
            input.value,
            input.checked,
          ]),
          buttons: [...region.querySelectorAll<HTMLButtonElement>("button")].map((button) => [
            button.disabled,
            button.getAttribute("aria-pressed"),
          ]),
          bars: [...region.querySelectorAll<HTMLElement>(".filter-bar")].map(
            (bar) => bar.style.width,
          ),
          outcomes: [...region.querySelectorAll<HTMLElement>(".tool-outcomes span")].map((bar) => [
            bar.dataset["outcome"],
            bar.style.flexGrow,
          ]),
          range: region.getAttribute("data-range"),
          coarse: region.getAttribute("data-coarse"),
          narrow: region.getAttribute("data-narrow"),
          graph: graphDrawing(region),
          updating: region.getAttribute("data-updating"),
          svg: svg && {
            viewBox: svg.getAttribute("viewBox"),
            width: svg.getAttribute("width"),
            height: svg.getAttribute("height"),
            markup: svg.innerHTML,
          },
          chartCursor: region.querySelector<HTMLElement>(".chart-cursor")?.style.left,
        }),
      );
    }
  };
  const observePalette = () => {
    const root = document.documentElement;
    if (
      root.dataset["paletteTheme"] !== root.dataset["theme"] ||
      root.dataset["paletteScheme"] !== root.dataset["colorScheme"]
    )
      flag("mixed-frame", "palette-choice");
    const style = getComputedStyle(root);
    retainDrawing(
      root,
      `palette/${root.dataset["paletteState"]}`,
      JSON.stringify(
        ["base", "deep", "text-base", "muted-base", "series-1", "level-4"].map((role) =>
          style.getPropertyValue(`--dashboard-${role}`),
        ),
      ),
    );
    const sheet = document.querySelector<HTMLElement>(".settings-sheet");
    if (sheet && sheet.dataset["theme"] !== root.dataset["paletteTheme"])
      flag("mixed-frame", "settings-theme");
    if (
      sheet &&
      sheet.dataset["scheme"] !== "system" &&
      sheet.dataset["scheme"] !== root.dataset["paletteScheme"]
    )
      flag("mixed-frame", "settings-scheme");
    if (sheet)
      retainDrawing(
        sheet,
        `preferences/${sheet.dataset["preferenceState"]}`,
        JSON.stringify({
          text: sheet.textContent,
          inputs: [...sheet.querySelectorAll<HTMLInputElement>("input")].map(
            (input) => input.checked,
          ),
          shortcuts: sheet.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
        }),
      );
  };
  const snapshot = () => {
    const root = page.documentElement;
    const style = getComputedStyle(root);
    return JSON.stringify({
      regions: [...document.querySelectorAll("[data-state]")].map((node) => [
        node.getAttribute("data-state"),
        node.textContent,
      ]),
      locals: [...document.querySelectorAll("[data-local-state]")].map((node) =>
        node.getAttribute("data-local-state"),
      ),
      charts: [...document.querySelectorAll(".chart-hit svg")].map((svg) => [
        svg.getAttribute("viewBox"),
        svg.innerHTML,
      ]),
      chartSelections: [
        ...document.querySelectorAll(
          ".chart-choices [aria-pressed], .chart-readout [aria-pressed]",
        ),
      ].map((node) => node.getAttribute("aria-pressed")),
      chartCursors: [...document.querySelectorAll<HTMLElement>(".chart-cursor")].map(
        (node) => node.style.left,
      ),
      inputs: [...document.querySelectorAll<HTMLInputElement>(".filters input")].map((input) => [
        input.value,
        input.checked,
      ]),
      bars: [...document.querySelectorAll<HTMLElement>(".filter-bar")].map(
        (bar) => bar.style.width,
      ),
      outcomes: [...document.querySelectorAll<HTMLElement>(".tool-outcomes span")].map((bar) => [
        bar.dataset["outcome"],
        bar.style.flexGrow,
      ]),
      range: document.querySelector(".range-control")?.textContent,
      graph: graphDrawing(document),
      title: document.title,
      settings: document.querySelector(".settings-sheet")?.textContent,
      options: [...document.querySelectorAll('[role="option"]')].map((node) => [
        node.textContent,
        node.getAttribute("aria-selected"),
      ]),
      theme: root.dataset["theme"],
      scheme: root.dataset["colorScheme"],
      colours: ["base", "deep", "text-base", "series-1", "level-4"].map((role) =>
        style.getPropertyValue(`--dashboard-${role}`),
      ),
    });
  };
  const pageComplete = (states: Set<string | null>, regions: Element[]) => {
    const dashboardComplete =
      !!page.querySelector("main h1") &&
      document.querySelectorAll(".headline-number").length === 10 &&
      document.querySelectorAll(".graph-surface rect[data-date]").length === 365 &&
      !!document.querySelector(".graph-readout") &&
      !!document.querySelector(".graph-streaks") &&
      document.querySelectorAll(".filter-checklist").length === 6 &&
      !!document.querySelector(".tool-outcomes") &&
      !!document.querySelector(".tool-filter-divider") &&
      !!document.querySelector(".range-control") &&
      !!document.querySelector(".live-status") &&
      !!document.querySelector(".chart-hit svg") &&
      !!document.querySelector(".chart-readout") &&
      regions.length >= 12 &&
      states.size === 1 &&
      document.fonts.check("440 13px Inter");
    const problemComplete =
      !!document.querySelector("[data-problem-state] h1") &&
      !!document.querySelector("[data-problem-state] p") &&
      !document.querySelector(".shell");
    return dashboardComplete || problemComplete;
  };
  const durations = ["transitionDuration", "animationDuration"] as const;
  const moving = (style: CSSStyleDeclaration) =>
    durations.some((property) =>
      style[property].split(",").some((duration) => Number.parseFloat(duration) > 0),
    );
  const commit = () => {
    evidence.samples++;
    for (const { check, cause } of frame.failures) fail(check, cause);
    for (const { region, key, drawing } of frame.drawings) {
      const before = painted.get(region);
      if (before?.key === key && before.drawing !== drawing)
        fail("mixed-frame", `stable-drawing:${regionKind(region)}`);
      painted.set(region, { key, drawing });
    }
    if (!frame.drawn) evidence.blank++;
    else if (frame.complete) evidence.complete++;
  };
  const observeCharts = () => {
    for (const chart of document.querySelectorAll(".usage-chart")) {
      const surface = chart.querySelector(".chart-hit");
      const mark = surface?.getAttribute("data-local-state");
      for (const node of chart.querySelectorAll(
        ".chart-hit, .chart-hit svg, .chart-readout, .chart-spoken",
      )) {
        if (node.getAttribute("data-local-state") !== mark)
          flag("mixed-frame", `chart-local-marks:${regionKind(node)}`);
      }
      if (
        surface?.getAttribute("data-size-state") !==
        surface?.querySelector("svg")?.getAttribute("data-size-state")
      )
        flag("mixed-frame", "chart-size-marks");
    }
  };
  const sample = () => {
    const started = performance.now();
    frame = { failures: [], drawings: [], drawn: false, complete: false };
    const root = document.getElementById("root");
    const drawn = !!root?.children.length;
    if (drawn) observePalette();
    const regions = [...document.querySelectorAll("[data-state]")];
    const states = new Set(regions.map((node) => node.getAttribute("data-state")));
    if (states.size > 1) flag("mixed-frame", "global-marks");
    observeRegions(regions);
    for (const list of document.querySelectorAll(".filter-checklist, .contribution-graph")) {
      const mark = list.getAttribute("data-local-state");
      if (
        [...list.querySelectorAll("[data-local-state]")].some(
          (node) => node.getAttribute("data-local-state") !== mark,
        )
      )
        flag("mixed-frame", "checklist-local-marks");
    }
    observeCharts();
    const drawings = performance.now();
    evidence.work.drawings += drawings - started;
    frame.drawn = drawn;
    frame.complete = pageComplete(states, regions);
    if (drawn && !frame.complete) flag("early-load-paint");
    if (document.getAnimations().length) flag("animation");
    const readiness = performance.now();
    evidence.work.readiness += readiness - drawings;
    for (const element of document.querySelectorAll("*")) {
      if (
        [undefined, "::before", "::after"].some((pseudo) =>
          moving(getComputedStyle(element, pseudo)),
        )
      )
        flag("animation");
    }
    const animations = performance.now();
    evidence.work.animations += animations - readiness;
    commit();
    evidence.work.commit += performance.now() - animations;
    performance.measure("opencode-stats:whole-paint-probe", {
      start: started,
      duration: performance.now() - started,
    });
  };
  window.wholePaint = { observing, evidence, snapshot, sample };
  // Timing tours keep only the on-demand pause/hidden snapshot helper. They do
  // not install a frame probe, alter rAF, or subtract an estimated probe cost.
  if (!observing) return;
  const channel = new MessageChannel();
  channel.port1.addEventListener("message", sample);
  channel.port1.start();
  // Queue the probe at the start of the rendering turn, but read after that
  // entire task: rAF, arbitrary microtask chains, and all ResizeObserver rounds.
  // HTML's unshipped-port queue orders this before local MessageChannel tasks
  // posted later in the turn (including the canaries' post-paint restoration).
  // Other task sources may intervene: this is not a compositor/physical-screen
  // API. Keep timing consumers on the separate observer-free tour.
  const observeFrame = () => {
    evidence.rafCount++;
    channel.port2.postMessage(null);
    evidence.raf = requestAnimationFrame(observeFrame);
  };
  evidence.raf = requestAnimationFrame(observeFrame);
}

declare global {
  interface Window {
    wholePaint: {
      observing: boolean;
      evidence: {
        failures: string[];
        causes: string[];
        samples: number;
        blank: number;
        complete: number;
        raf: number;
        rafCount: number;
        work: { drawings: number; readiness: number; animations: number; commit: number };
      };
      snapshot: () => string;
      sample: () => void;
    };
  }
}

export function assertPaintCheck(
  check: Check,
  failed: readonly string[],
  causes: readonly string[] = [],
) {
  if (failed.includes(check))
    throw new Error(`whole-paint:${check}${causes.length ? ` (${causes.join(",")})` : ""}`);
}

export function assertPaintEvidence(data: ChangeEvidence) {
  expect(data.observing, "whole-paint:observer-disabled").toBe(true);
  const evidence = data.evidence;
  for (const check of wholePaintChecks) assertPaintCheck(check, evidence.failures, evidence.causes);
  expect(evidence.samples).toBeGreaterThan(0);
  expect(evidence.complete).toBeGreaterThan(0);
  return evidence;
}

export async function paintEvidence(page: Page) {
  return assertPaintEvidence(await readChangeEvidence(page));
}

export function watchChangeRequests(context: BrowserContext) {
  let live = false;
  const failed: string[] = [];
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/browser-copy/live") return;
    if (live && path === "/api/browser-copy/changes") return;
    failed.push("user-change-network");
  });
  return {
    live: (allowed: boolean) => {
      live = allowed;
    },
    check: () => assertPaintCheck("user-change-network", failed),
    failures: failed,
  };
}

export async function wholeChange(page: Page, kind: string, action: () => Promise<void>) {
  const before = await tourWork(page, kind, "baseline", () =>
    page.evaluate((name) => {
      return {
        count: performance.getEntriesByName(`opencode-stats:change:${name}`).length,
        observing: window.wholePaint.observing,
        samples: window.wholePaint.evidence.samples,
      };
    }, kind),
  );
  await tourWork(page, kind, "action", action);
  await tourWork(page, kind, "paint", () =>
    page.waitForFunction(
      ({ name, count, observing, samples }) =>
        performance.getEntriesByName(`opencode-stats:change:${name}`).length > count &&
        (!observing || window.wholePaint.evidence.samples > samples),
      { name: kind, ...before },
    ),
  );
  // The native measure is published in its post-paint MessageChannel task.
  // The early frame probe's local port task precedes it. Waiting for both
  // completion and a newer probe sample certifies the action's frame without
  // asking the browser for two unrelated empty frames afterwards.
  const data = await tourWork(page, kind, "evidence", () =>
    readChangeEvidence(page, kind, before.count),
  );
  assertSummedMeasures(data.measures);
  // Any number of complete states may paint during an action: in particular a
  // real minute, live update or focus refresh can overlap it. The observer checks
  // agreement of drawn-state IDs and stable actual properties for each ID, not
  // a two-snapshot whitelist that would reject a third valid complete state.
  if (
    [
      "address",
      "preset",
      "remove-fixed",
      "shift",
      "filter",
      "remove-filter",
      "clear-filters",
      "chart-metric",
      "chart-split",
      "drill",
      "graph-select",
      "graph-metric",
    ].includes(kind)
  )
    expect(data.completedAddress, "whole-paint:completed-address").toBe(true);
  if (data.observing) assertPaintEvidence(data);
  else assertCleanChangeEvidence(data);
}
