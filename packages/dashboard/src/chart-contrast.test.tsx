import { cleanup } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { filterCopy } from "@opencode-stats/engine/testing";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";
import { initialMedia } from "./media-size.tsx";

beforeEach(() => dashboardEnvironment("/?range=7d"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("draws readable axis text outside the SVG image and keeps the renderer's ticks aligned on resize", async () => {
  const [media, setMedia] = createSignal({ ...initialMedia, columnWidth: 360 });
  const f = dashboardFixture(filterCopy(), queueMicrotask, media);
  onTestFinished(f.close);
  await f.view.findByRole("heading", { name: "Usage over time" });
  const axis = f.view.container.querySelector(".chart-y-axis")!;
  const labels = () => [...axis.querySelectorAll<HTMLElement>("span")];
  expect(labels().length).toBeGreaterThan(1);
  expect(labels()[0]!.textContent).toBe("0");
  expect(labels()[0]!.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  expect(Number.parseFloat(labels()[0]!.style.top)).toBeCloseTo(95.789, 3);
  expect(f.view.container.querySelectorAll(".chart-hit svg text")).toHaveLength(0);
  setMedia({ ...media(), columnWidth: 1280 });
  expect(f.view.container.querySelector(".chart-y-axis")).toBe(axis);
  expect(Number.parseFloat(labels()[0]!.style.top)).toBeCloseTo(96.923, 3);
});
