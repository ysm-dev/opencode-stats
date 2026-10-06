import { cleanup, fireEvent, within, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { filterCopy } from "@opencode-stats/engine/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";

beforeEach(() => dashboardEnvironment("/?range=all"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const marks = () =>
  [...document.querySelectorAll("[data-state]")].map((node) => node.getAttribute("data-state"));

it("times the existing CSS resize only after the complete page is mounted", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  fireEvent(window, new Event("resize"));
  await f.view.findByRole("heading", { name: "Overview" });
  const before = marks();
  const count = performance.getEntriesByName("opencode-stats:change:resize").length;
  fireEvent(window, new Event("resize"));
  await vi.waitFor(() =>
    expect(performance.getEntriesByName("opencode-stats:change:resize")).toHaveLength(count + 1),
  );
  expect(marks()).toEqual(before);
});

it("each region retains its drawn answer's mark while a newer complete filter answer is delayed", async () => {
  const deliveries: Array<() => void> = [];
  let held = false;
  const f = dashboardFixture(filterCopy(), (deliver) => {
    if (held) deliveries.push(deliver);
    else queueMicrotask(deliver);
  });
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Overview" });
  const before = marks();
  expect(before.length).toBeGreaterThan(12);
  expect(new Set(before).size).toBe(1);
  const models = within(f.view.getByRole("region", { name: "Model", exact: true }));
  held = true;
  const tick = models.getByRole("checkbox", { name: "Model 6" });
  await f.user.click(tick);
  await vi.waitFor(() => expect(deliveries).toHaveLength(1));
  expect(marks()).toEqual(before);
  expect(tick).toHaveProperty("checked", false);
  deliveries[0]!();
  await vi.waitFor(() => expect(tick).toHaveProperty("checked", true));
  expect(new Set(marks()).size).toBe(1);
  expect(marks()[0]).not.toBe(before[0]);
  const search = models.getByRole("searchbox", { name: "Search Model" });
  const global = marks()[0];
  const local = search.getAttribute("data-local-state");
  await f.user.type(search, "Model 6");
  expect(marks().every((mark) => mark === global)).toBe(true);
  expect(search.getAttribute("data-local-state")).not.toBe(local);
  const checklist = search.closest("section")!;
  expect(
    [...checklist.querySelectorAll("[data-local-state]")].every(
      (node) =>
        node.getAttribute("data-local-state") === checklist.getAttribute("data-local-state"),
    ),
  ).toBe(true);
});

it("Copy diagnostics reads only published safe timing statistics", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  await f.user.click(await f.view.findByRole("button", { name: "Settings" }));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  performance.measure("opencode-stats:change:filter", { start: 0, duration: 3 });
  await f.user.click(document.querySelector<HTMLButtonElement>(".settings-diagnostics")!);
  expect(writeText).toHaveBeenCalledOnce();
  const report = writeText.mock.calls[0]![0];
  expect(report).toContain('"kind":"filter"');
  expect(report).not.toContain("Model 6");
  expect(report).not.toContain("generation");
  performance.clearMeasures();
});

it("marks the palette object actually applied and keeps Settings choices coherent with that drawn CSS", async () => {
  const f = dashboardFixture(filterCopy());
  onTestFinished(f.close);
  await f.user.click(await f.view.findByRole("button", { name: "Settings" }));
  const sheet = within(document.querySelector<HTMLElement>(".settings-sheet")!);
  const root = document.documentElement;
  await vi.waitFor(() => expect(root.dataset["paletteTheme"]).toBe("oc-2"));
  const before = root.dataset["paletteState"];
  await f.user.click(sheet.getByRole("button", { name: /^Theme / }));
  await f.user.click(screen.getByRole("option", { name: "Matrix", exact: true }));
  await vi.waitFor(() => expect(root.dataset["paletteTheme"]).toBe("matrix"));
  expect(root.dataset["paletteState"]).not.toBe(before);
  expect(root.dataset["paletteTheme"]).toBe(root.dataset["theme"]);
  expect(document.querySelector<HTMLElement>(".settings-sheet")!.dataset["theme"]).toBe(
    root.dataset["paletteTheme"],
  );
  await f.user.click(sheet.getByRole("button", { name: /^Color scheme/ }));
  await f.user.click(screen.getByRole("option", { name: "Dark", exact: true }));
  await vi.waitFor(() => expect(root.dataset["paletteScheme"]).toBe("dark"));
  expect(root.style.colorScheme).toBe("dark");
  expect(root.dataset["colorScheme"]).toBe(root.dataset["paletteScheme"]);
});
