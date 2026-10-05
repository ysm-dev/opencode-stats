import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard, mountDashboard } from "./dashboard.tsx";
import { inThreadEngine } from "@opencode-stats/engine/testing";
import { inMemoryDashboardServer, syntheticCopy } from "@opencode-stats/browser-copy/testing";

const accessible = async (container: HTMLElement) => {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations).toEqual([]);
  expect(results.incomplete).toEqual([]);
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

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

describe("Overview", () => {
  it("paints all-history Tokens only after the real engine and fonts are ready", async () => {
    const load = deferred();
    const fonts = deferred();
    const server = inMemoryDashboardServer(
      syntheticCopy([
        { start: 1, input: 1000, cacheRead: 200, cacheWrite: 30, output: 4, reasoning: 5 },
        { start: 2, input: null, cacheRead: null, cacheWrite: null, output: null, reasoning: 6 },
      ]),
      () => load.promise,
    );
    const engine = inThreadEngine(server.fetch);
    const view = render(() => <Dashboard client={engine.client} ready={fonts.promise} />);
    const user = userEvent.setup();
    try {
      expect(view.container.textContent).toBe("");
      await vi.waitFor(() => expect(server.requests).toBe(1));
      load.resolve();
      await vi.waitFor(() => expect(engine.answers).toHaveLength(1));
      expect(view.container.textContent).toBe("");
      fonts.resolve();
      expect(await view.findByRole("heading", { name: "Overview", level: 1 })).toBeTruthy();
      expect(view.getByRole("region", { name: "Tokens" }).textContent).toBe("Tokens1,245");
      expect(view.getByText("All time")).toBeTruthy();
      expect(document.title).toBe("Overview · opencode-stats");
      expect(window.location.pathname + window.location.search).toBe("/?range=all");
      expect(view.getByRole("navigation", { name: "Pages" })).toBeTruthy();
      await user.tab();
      expect(view.getByRole("link", { name: "Skip to page" })).toBe(document.activeElement);
      await user.keyboard("{Enter}");
      expect(view.getByRole("main")).toBe(document.activeElement);
      expect(window.location.hash).toBe("");
      await user.click(view.getByRole("link", { name: "Overview" }));
      expect(window.location.pathname + window.location.search).toBe("/?range=all");
      expect(view.getByRole("region", { name: "Tokens" }).textContent).toBe("Tokens1,245");
      expect(server.requests).toBe(1);
      await accessible(view.container);
    } finally {
      load.resolve();
      fonts.resolve();
      cleanup();
      await engine.dispose();
      await server.dispose();
    }
  });
  it("keeps the page blank when fonts are ready before the copy, then mounts the complete page", async () => {
    const load = deferred();
    const server = inMemoryDashboardServer(syntheticCopy([]), () => load.promise);
    const engine = inThreadEngine(server.fetch);
    const root = document.createElement("div");
    document.body.append(root);
    const unmount = mountDashboard(root, engine.client, Promise.resolve());
    try {
      await vi.waitFor(() => expect(server.requests).toBe(1));
      expect(root.textContent).toBe("");
      load.resolve();
      await vi.waitFor(() => expect(root.querySelector(".headline-number")?.textContent).toBe("0"));
      unmount();
      expect(await engine.client.request({ kind: "all-time" })).toEqual({ kind: "closed" });
    } finally {
      load.resolve();
      unmount();
      root.remove();
      await engine.dispose();
      await server.dispose();
    }
  });
  it("draws the engine's complete problem screen instead of an empty Overview", async () => {
    const server = inMemoryDashboardServer(syntheticCopy([]));
    server.drop();
    const engine = inThreadEngine(server.fetch);
    const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
    try {
      expect(await view.findByRole("heading", { name: "Can't load the dashboard" })).toBeTruthy();
      expect(view.queryByRole("navigation")).toBeNull();
      expect(view.queryByText("Tokens")).toBeNull();
      await accessible(view.container);
    } finally {
      cleanup();
      await engine.dispose();
      await server.dispose();
    }
  });
  it.each(["replaced", "closed"])("does not paint a %s load request", async (outcome) => {
    const load = deferred();
    const server = inMemoryDashboardServer(syntheticCopy([]), () => load.promise);
    const engine = inThreadEngine(server.fetch);
    const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
    try {
      await vi.waitFor(() => expect(server.requests).toBe(1));
      if (outcome === "closed") engine.client.dispose();
      else void engine.client.request({ kind: "all-time" });
      load.resolve();
      await vi.waitFor(() => expect(engine.answers).toHaveLength(1));
      expect(view.container.textContent).toBe("");
    } finally {
      load.resolve();
      cleanup();
      await engine.dispose();
      await server.dispose();
    }
  });
});
