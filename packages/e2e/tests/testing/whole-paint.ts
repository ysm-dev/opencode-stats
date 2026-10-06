import type { BrowserContext, Page } from "playwright";
import { expect } from "vitest";

export const wholePaintChecks = [
  "mixed-frame",
  "user-change-network",
  "early-load-paint",
  "animation",
] as const;
type Check = (typeof wholePaintChecks)[number];

// Installed synthetic pages only. Keep diagnostics to counters and named checks;
// snapshots are used for comparisons, never printed in failures or reports.
export function installWholePaintObserver() {
  const evidence = {
    failures: [] as string[],
    samples: 0,
    blank: 0,
    complete: 0,
    raf: 0,
  };
  const fail = (check: string) => {
    if (!evidence.failures.includes(check)) evidence.failures.push(check);
  };
  const painted = new WeakMap<Element, { key: string; drawing: string }>();
  const retainDrawing = (region: Element, key: string, drawing: string) => {
    const before = painted.get(region);
    if (before?.key === key && before.drawing !== drawing) fail("mixed-frame");
    painted.set(region, { key, drawing });
  };
  const observeRegions = (regions: Element[]) => {
    for (const region of regions) {
      // This container contains several independent checklist search states.
      // Its own global mark is checked, and every checklist/row is checked below.
      if (region.classList.contains("filters")) continue;
      const local = region.closest(".filter-checklist")?.getAttribute("data-local-state") ?? "";
      retainDrawing(
        region,
        `${region.getAttribute("data-state")}/${local}`,
        JSON.stringify({
          text: region.textContent,
          inputs: [...region.querySelectorAll<HTMLInputElement>("input")].map((input) => [
            input.value,
            input.checked,
          ]),
          buttons: [...region.querySelectorAll<HTMLButtonElement>("button")].map(
            (button) => button.disabled,
          ),
          bars: [...region.querySelectorAll<HTMLElement>(".filter-bar")].map(
            (bar) => bar.style.width,
          ),
          outcomes: [...region.querySelectorAll<HTMLElement>(".tool-outcomes span")].map((bar) => [
            bar.dataset["outcome"],
            bar.style.flexGrow,
          ]),
          range: region.getAttribute("data-range"),
          updating: region.getAttribute("data-updating"),
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
      fail("mixed-frame");
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
    if (sheet && sheet.dataset["theme"] !== root.dataset["paletteTheme"]) fail("mixed-frame");
    if (
      sheet &&
      sheet.dataset["scheme"] !== "system" &&
      sheet.dataset["scheme"] !== root.dataset["paletteScheme"]
    )
      fail("mixed-frame");
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
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return JSON.stringify({
      regions: [...document.querySelectorAll("[data-state]")].map((node) => [
        node.getAttribute("data-state"),
        node.textContent,
      ]),
      locals: [...document.querySelectorAll("[data-local-state]")].map((node) =>
        node.getAttribute("data-local-state"),
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
      !!document.querySelector("main h1") &&
      document.querySelectorAll(".headline-number").length === 9 &&
      document.querySelectorAll(".filter-checklist").length === 6 &&
      !!document.querySelector(".tool-outcomes") &&
      !!document.querySelector(".tool-filter-divider") &&
      !!document.querySelector(".range-control") &&
      !!document.querySelector(".live-status") &&
      regions.length >= 12 &&
      states.size === 1 &&
      document.fonts.check("440 13px Inter");
    const problemComplete =
      !!document.querySelector("[data-problem-state] h1") &&
      !!document.querySelector("[data-problem-state] p") &&
      !document.querySelector(".shell");
    return dashboardComplete || problemComplete;
  };
  const sample = () => {
    evidence.samples++;
    const root = document.getElementById("root");
    const drawn = !!root?.children.length;
    if (drawn) observePalette();
    const regions = [...document.querySelectorAll("[data-state]")];
    const states = new Set(regions.map((node) => node.getAttribute("data-state")));
    if (states.size > 1) fail("mixed-frame");
    observeRegions(regions);
    for (const list of document.querySelectorAll(".filter-checklist")) {
      const mark = list.getAttribute("data-local-state");
      if (
        [...list.querySelectorAll("[data-local-state]")].some(
          (node) => node.getAttribute("data-local-state") !== mark,
        )
      )
        fail("mixed-frame");
    }
    if (!drawn) evidence.blank++;
    else if (pageComplete(states, regions)) evidence.complete++;
    else fail("early-load-paint");
    const moving = (style: CSSStyleDeclaration) =>
      [style.transitionDuration, style.animationDuration].some((durations) =>
        durations.split(",").some((duration) => Number.parseFloat(duration) > 0),
      );
    if (document.getAnimations().length) fail("animation");
    for (const element of document.querySelectorAll("*")) {
      if (
        [undefined, "::before", "::after"].some((pseudo) =>
          moving(getComputedStyle(element, pseudo)),
        )
      )
        fail("animation");
    }
    evidence.raf = requestAnimationFrame(sample);
  };
  window.wholePaint = { evidence, snapshot, sample };
  evidence.raf = requestAnimationFrame(sample);
}

declare global {
  interface Window {
    wholePaint: {
      evidence: {
        failures: string[];
        samples: number;
        blank: number;
        complete: number;
        raf: number;
      };
      snapshot: () => string;
      sample: () => void;
    };
  }
}

export function assertPaintCheck(check: Check, failed: readonly string[]) {
  if (failed.includes(check)) throw new Error(`whole-paint:${check}`);
}

export async function paintEvidence(page: Page) {
  const evidence = await page.evaluate(() => {
    const { failures, samples, blank, complete } = window.wholePaint.evidence;
    return { failures, samples, blank, complete };
  });
  for (const check of wholePaintChecks) assertPaintCheck(check, evidence.failures);
  expect(evidence.samples).toBeGreaterThan(0);
  expect(evidence.complete).toBeGreaterThan(0);
  return evidence;
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
  const before = await page.evaluate((name) => {
    return {
      count: performance.getEntriesByName(`opencode-stats:change:${name}`).length,
    };
  }, kind);
  await action();
  await page.waitForFunction(
    ({ name, count }) =>
      performance.getEntriesByName(`opencode-stats:change:${name}`).length > count,
    { name: kind, count: before.count },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const measures = await page.evaluate((name) => {
    // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: browser User Timing detail is untrusted, and must narrow to four numbers
    const parts = (input: unknown) => {
      if (
        typeof input !== "object" ||
        input === null ||
        !("input" in input) ||
        typeof input.input !== "number" ||
        !("compute" in input) ||
        typeof input.compute !== "number" ||
        !("page" in input) ||
        typeof input.page !== "number" ||
        !("paint" in input) ||
        typeof input.paint !== "number"
      )
        throw new Error("whole-paint:invalid-clock");
      return [input.input, input.compute, input.page, input.paint];
    };
    return performance.getEntriesByName(`opencode-stats:change:${name}`).map((entry) => {
      if (!(entry instanceof PerformanceMeasure)) throw new Error("whole-paint:missing-measure");
      return { duration: entry.duration, parts: parts(entry.detail) };
    });
  }, kind);
  for (const { duration, parts } of measures) {
    expect(
      parts.every((part) => Number.isFinite(part) && part >= 0),
      "whole-paint:invalid-clock",
    ).toBe(true);
    expect(duration, "whole-paint:unsummed-clock").toBeCloseTo(
      parts.reduce((sum, part) => sum + part, 0),
      5,
    );
  }
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
    ].includes(kind)
  )
    expect(
      await page.evaluate(
        () =>
          document.querySelector(".range-control")!.getAttribute("data-range") ===
          location.pathname + location.search,
      ),
      "whole-paint:completed-address",
    ).toBe(true);
  await paintEvidence(page);
}
