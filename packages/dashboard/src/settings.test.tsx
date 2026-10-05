import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inThreadEngine } from "@opencode-stats/engine/testing";
import { inMemoryDashboardServer, syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { Dashboard } from "./dashboard.tsx";
import { startup } from "./startup.ts";
import { prepaintThemes } from "./preload.ts";

const native = window.localStorage;
const listeners = vi.spyOn(window, "addEventListener");
let dark = false;
let media: EventTarget;
beforeEach(() => {
  document.head.replaceChildren();
  Object.defineProperty(window, "localStorage", { configurable: true, value: native });
  native.clear();
  dark = false;
  media = new EventTarget();
  Object.defineProperty(media, "matches", { get: () => dark });
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("scrollTo", () => {});
  startup(prepaintThemes());
});
afterEach(() => {
  cleanup();
  for (const [name, listener, options] of listeners.mock.calls)
    window.removeEventListener(name, listener, options);
  listeners.mockClear();
  Object.defineProperty(window, "localStorage", { configurable: true, value: native });
  vi.unstubAllGlobals();
});

const dashboard = () => {
  const server = inMemoryDashboardServer(
    syntheticCopy([
      { start: 1, input: 987, cacheRead: null, cacheWrite: null, output: null, reasoning: null },
    ]),
  );
  const engine = inThreadEngine(server.fetch);
  const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
  const user = userEvent.setup();
  return {
    server,
    engine,
    view,
    user,
    close: async () => {
      cleanup();
      await engine.dispose();
      await server.dispose();
    },
  };
};
const accessible = async () => {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
};
it("changes exactly three preferences through the real provider without touching page data", async () => {
  const { server, engine, view, user, close } = dashboard();
  try {
    await view.findByRole("heading", { name: "Overview" });
    const page = view.getByRole("region", { name: "Tokens" });
    const gear = view.getByRole("button", { name: "Settings" });
    await user.click(gear);
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("heading", { name: "Settings" })).toBe(document.activeElement);
    await user.tab();
    const scheme = screen.getByRole("button", { name: /^Color scheme/ });
    expect(document.activeElement).toBe(scheme);
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
    await user.keyboard("{End}{Enter}");
    await vi.waitFor(() => expect(document.documentElement.dataset["colorScheme"]).toBe("dark"));
    await user.click(screen.getByRole("button", { name: /^Theme / }));
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "AMOLED",
      "Aura",
      "Ayu",
      "Carbonfox",
      "Catppuccin",
      "Catppuccin Frappe",
      "Catppuccin Macchiato",
      "Cobalt2",
      "Cursor",
      "Dracula",
      "Everforest",
      "Flexoki",
      "GitHub",
      "Gruvbox",
      "Kanagawa",
      "Lucent Orng",
      "Material",
      "Matrix",
      "Mercury",
      "Monokai",
      "Night Owl",
      "Nord",
      "OpenCode",
      "One Dark",
      "One Dark Pro",
      "Orng",
      "Osaka Jade",
      "Palenight",
      "Rose Pine",
      "Shades of Purple",
      "Solarized",
      "Synthwave '84",
      "Tokyonight",
      "Vercel",
      "Vesper",
      "Zenburn",
    ]);
    await user.click(screen.getByRole("option", { name: "Matrix" }));
    await vi.waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("matrix"));
    const toggle = screen.getByRole("switch", { name: "Single-key shortcuts" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("off");
    await user.click(toggle);
    expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("on");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    expect(view.container.contains(page)).toBe(true);
    expect(page.textContent).toBe("Tokens987");
    expect(server.requests).toBe(1);
    expect(engine.answers).toHaveLength(1);
    await accessible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(gear);
  } finally {
    await close();
  }
});

it("keeps controlled preferences when a selected option is selected again", async () => {
  const { view, user, close } = dashboard();
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await user.click(await view.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: /^Color scheme/ }));
    await user.click(screen.getByRole("option", { name: "System" }));
    expect(screen.getByRole("button", { name: /^Color scheme/ }).textContent).toBe("System");
    await user.click(screen.getByRole("button", { name: /^Theme / }));
    await user.click(screen.getByRole("option", { name: "OpenCode" }));
    expect(screen.getByRole("button", { name: /^Theme / }).textContent).toBe("OpenCode");
    expect(localStorage.getItem("opencode-theme-id")).toBe("oc-2");
    expect(localStorage.getItem("opencode-color-scheme")).toBe("system");
    expect(warnings).not.toHaveBeenCalled();
  } finally {
    warnings.mockRestore();
    await close();
  }
});

it("shows a stored Off choice on the first visit and ignores unrelated other-tab writes", async () => {
  localStorage.setItem("opencode-stats-single-key-shortcuts", "off");
  const { view, user, close } = dashboard();
  try {
    await user.click(await view.findByRole("button", { name: "Settings" }));
    const toggle = screen.getByRole("switch", { name: "Single-key shortcuts" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "on" }));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  } finally {
    await close();
  }
});

it("loads through an initially denied getter and explains tab memory when Settings first opens", async () => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("denied", "SecurityError");
    },
  });
  startup(prepaintThemes());
  const { view, user, close } = dashboard();
  try {
    await user.click(await view.findByRole("button", { name: "Settings" }));
    expect(screen.getByText("Your browser keeps preferences only for this tab.")).toBeTruthy();
    await user.click(screen.getByText("Single-key shortcuts"));
    expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("off");
  } finally {
    await close();
  }
});

it("releases every preference subscription when its dashboard is disposed", async () => {
  const first = listeners.mock.calls.length;
  const removals = vi.spyOn(window, "removeEventListener");
  const { view, close } = dashboard();
  try {
    await view.findByRole("heading", { name: "Overview" });
    const registered = listeners.mock.calls
      .slice(first)
      .filter(([name]) => name === "storage" || name === "preferences-storage");
    expect(registered.length).toBe(3);
    await close();
    for (const [name, listener] of registered)
      expect(
        removals.mock.calls.some(
          ([removed, callback]) => removed === name && callback === listener,
        ),
      ).toBe(true);
  } finally {
    removals.mockRestore();
    await close();
  }
});

it("keeps an early keyboard reading after the published select's deferred autofocus, then accepts pointer selection", async () => {
  const { view, user, close } = dashboard();
  try {
    await user.click(await view.findByRole("button", { name: "Settings" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Theme / }), {
      pointerType: "mouse",
      button: 0,
    });
    fireEvent.keyDown(screen.getByRole("option", { name: "OpenCode" }), { key: "End" });
    screen.getByRole("option", { name: "OpenCode" }).focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("option", { name: "Zenburn" })).toBe(document.activeElement);
    const aura = screen.getByRole("option", { name: "Aura" });
    fireEvent.pointerMove(aura, { pointerType: "mouse" });
    aura.focus();
    await Promise.resolve();
    expect(aura).toBe(document.activeElement);
    await user.click(screen.getByRole("option", { name: "Aura" }));
    expect(document.documentElement.dataset["theme"]).toBe("aura");
    expect(screen.queryByRole("listbox")).toBeNull();
  } finally {
    await close();
  }
});

it("coordinates the real provider with dashboard CSS, root scheme and browser theme colour in one turn", async () => {
  const { view, user, close, engine, server } = dashboard();
  const properties = [
    "base",
    "deep",
    "text-base",
    "muted-base",
    "focus-base",
    "edge-base",
    "series-1",
    "series-8",
  ];
  const colours = () =>
    properties.map((property) =>
      getComputedStyle(document.documentElement).getPropertyValue(`--dashboard-${property}`),
    );
  try {
    await view.findByRole("heading", { name: "Overview" });
    expect(colours()).toEqual([
      "#ffffffff",
      "#fafafaff",
      "#161616ff",
      "#5c5c5cff",
      "#3b5cf6ff",
      "#808080ff",
      "#0b34f4ff",
      "#808080ff",
    ]);
    expect(document.documentElement.style.colorScheme).toBe("light");
    const sheets = document.styleSheets.length;
    await user.click(view.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: /^Color scheme/ }));
    await user.click(screen.getByRole("option", { name: "Dark" }));
    expect(colours()).toEqual([
      "#161616ff",
      "#080808ff",
      "#fafafaff",
      "#aeaeaeff",
      "#7698fdff",
      "#808080ff",
      "#a2bcffff",
      "#dbdbdbff",
    ]);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--dashboard-background")).toBe(
      "#080808ff",
    );
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe(
      "#080808ff",
    );
    expect(document.styleSheets.length).toBe(sheets);
    expect(server.requests).toBe(1);
    expect(engine.answers).toHaveLength(1);
  } finally {
    await close();
  }
});

it("traps both Tab directions, leaves nested Escape to the real select, and restores the gear", async () => {
  const { view, user, close } = dashboard();
  try {
    const gear = await view.findByRole("button", { name: "Settings" });
    await user.click(gear);
    expect(view.container.querySelector(".shell")?.hasAttribute("inert")).toBe(true);
    expect(view.queryByRole("navigation", { name: "Pages" })).toBeNull();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Done" })).toBe(document.activeElement);
    await user.tab();
    const scheme = screen.getByRole("button", { name: /^Color scheme/ });
    expect(scheme).toBe(document.activeElement);
    await user.tab();
    const theme = screen.getByRole("button", { name: /^Theme / });
    expect(theme).toBe(document.activeElement);
    await user.tab();
    expect(screen.getByRole("switch", { name: "Single-key shortcuts" })).toBe(
      document.activeElement,
    );
    await user.tab({ shift: true });
    expect(theme).toBe(document.activeElement);
    await user.tab({ shift: true });
    expect(scheme).toBe(document.activeElement);
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Done" })).toBe(document.activeElement);
    await user.tab();
    await user.keyboard("{Enter}{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(scheme).toBe(document.activeElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(view.container.querySelector(".shell")?.hasAttribute("inert")).toBe(false);
    expect(view.getByRole("navigation", { name: "Pages" })).toBeTruthy();
    expect(gear).toBe(document.activeElement);
    await user.click(gear);
    await user.click(screen.getByRole("heading", { name: "Settings" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(document.querySelector<HTMLElement>(".settings-backdrop")!);
    expect(gear).toBe(document.activeElement);
  } finally {
    await close();
  }
});

it("cancels a covering-sheet Escape and releases its native listeners without overwriting an existing scroll policy", async () => {
  document.body.style.overflow = "clip";
  const additions = vi.spyOn(document, "addEventListener");
  const { view, user, close } = dashboard();
  try {
    await user.click(await view.findByRole("button", { name: "Settings" }));
    expect(document.body.style.overflow).toBe("hidden");
    const bindings = additions.mock.calls.filter(
      ([name, , options]) =>
        ["keydown", "pointerdown", "pointermove"].includes(name) &&
        typeof options === "object" &&
        options.signal,
    );
    expect(bindings.length).toBe(3);
    const options = bindings.map(([, , option]) =>
      typeof option === "object" ? option : undefined,
    );
    expect(options.map((option) => option?.capture)).toEqual([true, true, true]);
    expect(options.map((option) => option?.signal?.aborted)).toEqual([false, false, false]);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("clip");
    expect(options.map((option) => option?.signal?.aborted)).toEqual([true, true, true]);
  } finally {
    additions.mockRestore();
    document.body.style.overflow = "";
    await close();
  }
});

it("can finish closing when the opener and page title are both gone", async () => {
  const { view, user, close } = dashboard();
  try {
    const gear = await view.findByRole("button", { name: "Settings" });
    const title = view.getByRole("heading", { name: "Overview" });
    await user.click(gear);
    gear.remove();
    title.remove();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  } finally {
    await close();
  }
});

it("returns to the page title if the opener disappears", async () => {
  const { view, user, close } = dashboard();
  try {
    const gear = await view.findByRole("button", { name: "Settings" });
    await user.click(gear);
    gear.remove();
    await user.keyboard("{Escape}");
    expect(view.getByRole("heading", { name: "Overview" })).toBe(document.activeElement);
  } finally {
    await close();
  }
});

it("follows system and cross-tab changes in the actual provider while preserving the page", async () => {
  const { view, user, close, server, engine } = dashboard();
  try {
    await view.findByRole("heading", { name: "Overview" });
    const number = view.getByText("987");
    await user.click(view.getByRole("button", { name: "Settings" }));
    dark = true;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset["colorScheme"]).toBe("dark");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-color-scheme", newValue: "light" }),
    );
    await vi.waitFor(() => expect(document.documentElement.dataset["colorScheme"]).toBe("light"));
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset["colorScheme"]).toBe("light");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-theme-id", newValue: "everforest" }),
    );
    await vi.waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("everforest"));
    expect(document.documentElement.style.backgroundColor).not.toBe("rgb(250, 250, 250)");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-stats-single-key-shortcuts", newValue: "off" }),
    );
    expect(
      screen.getByRole("switch", { name: "Single-key shortcuts" }).getAttribute("aria-checked"),
    ).toBe("false");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-color-scheme", newValue: "invalid" }),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: /^Color scheme/ }).textContent).toBe("System"),
    );
    expect(document.documentElement.dataset["colorScheme"]).toBe("dark");
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    await vi.waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("oc-2"));
    expect(
      screen.getByRole("switch", { name: "Single-key shortcuts" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(number.textContent).toBe("987");
    expect(number.isConnected).toBe(true);
    expect(server.requests).toBe(1);
    expect(engine.answers).toHaveLength(1);
  } finally {
    await close();
  }
});

it("reports a late native write refusal and keeps preference changes working for the tab", async () => {
  const { view, user, close } = dashboard();
  const writes = vi.spyOn(Storage.prototype, "setItem");
  try {
    await view.findByRole("heading", { name: "Overview" });
    await user.click(view.getByRole("button", { name: "Settings" }));
    expect(screen.queryByText("Your browser keeps preferences only for this tab.")).toBeNull();
    writes.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await user.click(screen.getByRole("switch", { name: "Single-key shortcuts" }));
    expect(screen.getByText("Your browser keeps preferences only for this tab.")).toBeTruthy();
    expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("off");
    await user.click(screen.getByRole("button", { name: /^Color scheme/ }));
    await user.click(screen.getByRole("option", { name: "Dark" }));
    expect(document.documentElement.dataset["colorScheme"]).toBe("dark");
    await accessible();
  } finally {
    writes.mockRestore();
    await close();
  }
});
