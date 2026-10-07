import { cleanup } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { filterCopy } from "@opencode-stats/engine/testing";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";
import { dashboardEnvironment } from "./testing/environment.ts";

beforeEach(() => {
  dashboardEnvironment("/?range=7d");
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const pointer = (
  target: Element | Window,
  type: string,
  x: number,
  y: number,
  source = "mouse",
) => {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerType: source, button: 0 });
  target.dispatchEvent(event);
};

it.each([
  { surface: ".graph-surface", readout: ".graph-readout" },
  { surface: ".chart-hit", readout: ".chart-readout" },
])(
  "$surface keeps keyboard reading through stationary pointer events from scrolling",
  async (selectors) => {
    await using f = dashboardFixture(filterCopy());
    await f.view.findByRole("heading", { name: "Overview" });
    const surface = document.querySelector<SVGSVGElement | HTMLDivElement>(selectors.surface)!;
    const readout = document.querySelector(selectors.readout)!;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 848, 176));
    // The previous input can be outside the drawing, such as its metric button.
    pointer(window, "pointerup", 60, 56, "touch");
    surface.focus();
    await f.user.keyboard("{End}");
    expect(readout.textContent).toContain("7 Oct 2026");
    const reading = readout.textContent;
    pointer(surface, "pointermove", 60, 56);
    expect(readout.textContent).toBe(reading);
    // WebKit also reports zero movementX/Y for real moves: compare client points.
    pointer(surface, "pointermove", 61, 56);
    expect(readout.textContent).not.toBe(reading);
    await f.user.keyboard("{End}");
    pointer(surface, "pointermove", 61, 70);
    expect(readout.textContent).not.toBe(reading);
    await f.user.keyboard("{End}");
    // A deliberate tap at the same point still reads, without selecting a range.
    pointer(surface, "pointerdown", 61, 70, "touch");
    pointer(surface, "pointerup", 61, 70, "touch");
    expect(readout.textContent).not.toBe(reading);
    expect(window.location.search).toBe("?range=7d");
  },
);
