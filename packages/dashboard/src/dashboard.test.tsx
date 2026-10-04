import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./dashboard.tsx";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("empty dashboard", () => {
  it("lets a user navigate the typed pages and gives each drawn page an accessible name", async () => {
    const view = render(Dashboard);
    const user = userEvent.setup();
    expect(await view.findByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(view.getByText("No activity to show yet.")).toBeTruthy();
    for (const name of ["Models", "Projects", "Agents", "Tools", "Sessions", "Overview"]) {
      await user.click(view.getByRole("link", { name }));
      expect(await view.findByRole("heading", { name })).toBeTruthy();
      expect(document.title).toBe(`${name} · opencode-stats`);
      const results = await axe.run(view.container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results.violations).toEqual([]);
      expect(results.incomplete).toEqual([]);
    }
  });
});
