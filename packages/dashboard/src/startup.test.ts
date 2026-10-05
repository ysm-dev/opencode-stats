import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classicPreload, prepaintThemes } from "./preload.ts";
import { startup } from "./startup.ts";
import type { PrepaintData } from "./startup.ts";
import { crc32 } from "node:zlib";
import {
  DEFAULT_THEMES,
  resolveThemeVariant,
  resolveThemeVariantV2,
  themeToCss,
  themeV2ToCss,
} from "@opencode/ui/theme";

const native = window.localStorage;
const listeners = vi.spyOn(window, "addEventListener");
const cacheFor = (id: string, dark: boolean) => {
  const theme = DEFAULT_THEMES[id]!;
  const variant = dark ? theme.dark : theme.light;
  return (
    themeToCss(resolveThemeVariant(variant, dark)) +
    "\n  " +
    themeV2ToCss(resolveThemeVariantV2(variant, dark))
  );
};
const storageTwin = () => ({
  getItem: vi.fn<Storage["getItem"]>(native.getItem.bind(native)),
  setItem: vi.fn<Storage["setItem"]>(native.setItem.bind(native)),
  removeItem: vi.fn<Storage["removeItem"]>(native.removeItem.bind(native)),
  key: vi.fn<Storage["key"]>(native.key.bind(native)),
  clear: vi.fn<Storage["clear"]>(native.clear.bind(native)),
  get length() {
    return native.length;
  },
});
const installStorage = (storage: Storage) =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
const defaults = [
  ["opencode-theme-id", "oc-2"],
  ["opencode-color-scheme", "system"],
  ["opencode-stats-single-key-shortcuts", "on"],
];
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: native });
  native.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  for (const [name, listener, options] of listeners.mock.calls)
    window.removeEventListener(name, listener, options);
  listeners.mockClear();
  Object.defineProperty(window, "localStorage", { configurable: true, value: native });
  document.getElementById("oc-theme-preload")?.remove();
  vi.unstubAllGlobals();
});
describe.each(["classic", "direct"])("the actual synchronous preference preload (%s)", (mode) => {
  const run = async (data: PrepaintData = prepaintThemes()) => {
    if (mode === "classic") window.eval(await classicPreload(data));
    else startup(data);
  };
  it("normalizes unknown preferences before the published provider can read them", async () => {
    native.setItem("opencode-theme-id", "<unknown>");
    native.setItem("opencode-color-scheme", "sepia");
    native.setItem("opencode-stats-single-key-shortcuts", "maybe");
    await run();
    expect(localStorage.getItem("opencode-theme-id")).toBe("oc-2");
    expect(localStorage.getItem("opencode-color-scheme")).toBe("system");
    expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("on");
    expect(document.documentElement.dataset["colorScheme"]).toBe("light");
    expect(document.documentElement.style.backgroundColor).toBe("rgb(250, 250, 250)");
    expect(document.documentElement.style.getPropertyValue("--dashboard-background")).toBe(
      "#fafafaff",
    );
  });
  it("guards a denied property getter and provides Storage-shaped tab memory", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    await run();
    expect(document.documentElement.dataset["preferencesStorage"]).toBe("tab");
    localStorage.setItem("opencode-theme-id", "matrix");
    expect(localStorage.getItem("opencode-theme-id")).toBe("matrix");
    expect(localStorage.length).toBe(3);
    expect(localStorage.key(1)).toBe("opencode-color-scheme");
    expect(localStorage.key(9)).toBeNull();
    localStorage.removeItem("opencode-theme-id");
    expect(localStorage.getItem("opencode-theme-id")).toBeNull();
    localStorage.clear();
    expect(localStorage.length).toBe(0);
  });
  it("paints a stored non-default theme with its current safe provider cache", async () => {
    const theme = DEFAULT_THEMES["matrix"]!;
    const css =
      themeToCss(resolveThemeVariant(theme.light, false)) +
      "\n  " +
      themeV2ToCss(resolveThemeVariantV2(theme.light, false));
    native.setItem("opencode-theme-id", "matrix");
    native.setItem("opencode-color-scheme", "light");
    native.setItem("opencode-theme-css-light", css);
    await run();
    expect(document.documentElement.dataset["theme"]).toBe("matrix");
    expect(document.getElementById("oc-theme-preload")!.textContent).toContain(css);
    expect(document.documentElement.style.backgroundColor).not.toBe("rgb(242, 242, 242)");
  });
  it.each(["light", "dark", "system"])(
    "retains valid %s and Off, resolving System against the OS",
    async (scheme) => {
      native.setItem("opencode-color-scheme", scheme);
      native.setItem("opencode-stats-single-key-shortcuts", "off");
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
      }));
      await run();
      expect(localStorage.getItem("opencode-color-scheme")).toBe(scheme);
      expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("off");
      expect(document.documentElement.dataset["colorScheme"]).toBe(
        scheme === "light" ? "light" : "dark",
      );
      expect(document.documentElement.style.colorScheme).toBe(
        scheme === "light" ? "light" : "dark",
      );
      expect(document.getElementById("oc-theme-preload")!.textContent).toContain(
        scheme === "light" ? "multiply" : "plus-lighter",
      );
      expect(document.documentElement.dataset["preferencesStorage"]).toBe("persistent");
    },
  );
  it.each(Object.keys(DEFAULT_THEMES).filter((id) => id !== "oc-2"))(
    "accepts both real %s cache variants including provider elevation shadows",
    async (id) => {
      native.setItem("opencode-theme-id", id);
      const light = cacheFor(id, false);
      const dark = cacheFor(id, true);
      native.setItem("opencode-theme-css-light", light);
      native.setItem("opencode-theme-css-dark", dark);
      await run();
      expect(localStorage.getItem("opencode-theme-css-light")).toBe(light);
      expect(localStorage.getItem("opencode-theme-css-dark")).toBe(dark);
      expect(document.getElementById("oc-theme-preload")!.textContent).toContain(light);
    },
  );
  it.each([
    "body{background:red}",
    "--v2-grey-100:url(https://evil.invalid);",
    "color:#ff0000;",
    "--v2-grey-100:expression(alert(1));",
    "--v2-grey-100:#abcdef;",
  ])("rejects unsafe or stale cache %s without discarding the saved theme", async (css) => {
    native.setItem("opencode-theme-id", "matrix");
    native.setItem("opencode-theme-css-light", css);
    native.setItem("opencode-theme-css-dark", cacheFor("dracula", true));
    await run();
    expect(localStorage.getItem("opencode-theme-css-light")).toBeNull();
    expect(localStorage.getItem("opencode-theme-css-dark")).toBeNull();
    expect(localStorage.getItem("opencode-theme-id")).toBe("matrix");
    expect(document.documentElement.style.backgroundColor).toBe("rgb(235, 240, 232)");
    expect(document.getElementById("oc-theme-preload")!.textContent).not.toContain(css);
  });
  it.each([
    "--v2-grey-100: #ffffff; body{background:red}",
    "--v2-grey-100: url(https://evil.invalid);",
    "prefix--v2-grey-100: #ffffff;",
    "--v2-grey-100: #ffffff\nbody{background:red}",
    "--not-a-provider-token: #ffffff;",
    "--v2-grey-100: var(--unrecognized-resource);",
    "--v2-grey-100: var(--V2-grey-100);",
    "color: #ffffff;",
    "XXv2-grey-100: #ffffff;",
  ])("rejects unsafe CSS even when its consistency checksum matches: %s", async (css) => {
    const data = prepaintThemes();
    const matrix = data.themes["matrix"]!;
    const collision = {
      ...data,
      themes: {
        ...data.themes,
        matrix: { ...matrix, light: { ...matrix.light, fingerprint: String(crc32(css)) } },
      },
    };
    native.setItem("opencode-theme-id", "matrix");
    native.setItem("opencode-theme-css-light", css);
    await run(collision);
    expect(localStorage.getItem("opencode-theme-css-light")).toBeNull();
    expect(document.getElementById("oc-theme-preload")!.textContent).not.toContain(css);
    expect(document.documentElement.dataset["theme"]).toBe("matrix");
  });
  it.each([
    "--v2-grey-100:#abcdef; \n ",
    "--v2-grey-100:   #abcdef   ;",
    "--v2-elevation-raised: -10.55px .75px 0px #ffffff;",
  ])("keeps safe declaration formatting %s", async (css) => {
    const data = prepaintThemes();
    const matrix = data.themes["matrix"]!;
    native.setItem("opencode-theme-id", "matrix");
    native.setItem("opencode-theme-css-light", css);
    await run({
      ...data,
      themes: {
        ...data.themes,
        matrix: { ...matrix, light: { ...matrix.light, fingerprint: String(crc32(css)) } },
      },
    });
    expect(localStorage.getItem("opencode-theme-css-light")).toBe(css);
    expect(document.getElementById("oc-theme-preload")!.textContent).toContain(css);
  });
  it("drops caches for the default theme and preserves an existing probe value", async () => {
    native.setItem("opencode-stats-storage-probe", "do not lose this");
    native.setItem("opencode-theme-css-light", cacheFor("oc-2", false));
    await run();
    expect(localStorage.getItem("opencode-theme-css-light")).toBeNull();
    expect(localStorage.getItem("opencode-stats-storage-probe")).toBe("do not lose this");
    expect(localStorage.length).toBe(4);
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).toSorted(
        (a, b) => String(a).localeCompare(String(b)),
      ),
    ).toEqual([
      "opencode-color-scheme",
      "opencode-stats-single-key-shortcuts",
      "opencode-stats-storage-probe",
      "opencode-theme-id",
    ]);
  });
  it.each(["getItem", "setItem", "removeItem"] as const)(
    "handles startup %s refusal and preserves every still-readable preference",
    async (method) => {
      native.setItem("opencode-theme-id", "matrix");
      const twin = storageTwin();
      twin[method].mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
      installStorage(twin);
      await run();
      expect(document.documentElement.dataset["preferencesStorage"]).toBe("tab");
      expect(localStorage.getItem("opencode-theme-id")).toBe(
        method === "getItem" ? "oc-2" : "matrix",
      );
      localStorage.setItem("opencode-color-scheme", "dark");
      expect(localStorage.getItem("opencode-color-scheme")).toBe("dark");
    },
  );
  it("preserves all readable preferences and both caches before the first refused write", async () => {
    native.setItem("opencode-theme-id", "matrix");
    native.setItem("opencode-color-scheme", "dark");
    native.setItem("opencode-stats-single-key-shortcuts", "off");
    const light = cacheFor("matrix", false);
    const dark = cacheFor("matrix", true);
    native.setItem("opencode-theme-css-light", light);
    native.setItem("opencode-theme-css-dark", dark);
    const twin = storageTwin();
    twin.setItem.mockImplementation(() => {
      throw new Error("denied");
    });
    installStorage(twin);
    await run();
    expect(localStorage.getItem("opencode-color-scheme")).toBe("dark");
    expect(localStorage.getItem("opencode-stats-single-key-shortcuts")).toBe("off");
    expect(localStorage.getItem("opencode-theme-css-light")).toBe(light);
    expect(localStorage.getItem("opencode-theme-css-dark")).toBe(dark);
    expect(document.getElementById("oc-theme-preload")!.textContent).toContain(dark);
  });
  it("detects a full store even when normalization merely rewrites unchanged values", async () => {
    native.setItem("opencode-theme-id", "matrix");
    native.setItem("opencode-color-scheme", "dark");
    native.setItem("opencode-stats-single-key-shortcuts", "off");
    const twin = storageTwin();
    twin.setItem.mockImplementation((key, value) => {
      if (value.length && native.getItem(key) === null)
        throw new DOMException("full", "QuotaExceededError");
      native.setItem(key, value);
    });
    installStorage(twin);
    await run();
    expect(document.documentElement.dataset["preferencesStorage"]).toBe("tab");
    expect(localStorage.getItem("opencode-theme-id")).toBe("matrix");
  });
  it("does not retain a deleted native item when a subsequent write falls back to memory", async () => {
    const twin = storageTwin();
    installStorage(twin);
    await run();
    localStorage.setItem("remembered", "value");
    native.removeItem("remembered");
    expect(localStorage.getItem("remembered")).toBeNull();
    twin.setItem.mockImplementation(() => {
      throw new Error("denied");
    });
    localStorage.setItem("opencode-theme-id", "matrix");
    expect(localStorage.length).toBe(3);
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)),
    ).not.toContain("remembered");
  });
  it("falls back on a late quota failure, keeping writes in tab memory and notifying the UI", async () => {
    const twin = storageTwin();
    installStorage(twin);
    await run();
    const notices = vi.fn<() => void>();
    window.addEventListener("preferences-storage", notices);
    twin.setItem.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    localStorage.setItem("opencode-theme-id", "everforest");
    expect(localStorage.getItem("opencode-theme-id")).toBe("everforest");
    expect(localStorage.getItem("opencode-color-scheme")).toBe("system");
    expect(document.documentElement.dataset["preferencesStorage"]).toBe("tab");
    expect(notices).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(3);
    const nativeWrites = twin.setItem.mock.calls.length;
    window.eval("localStorage.setItem(42, 23)");
    expect(localStorage.getItem("42")).toBe("23");
    expect(twin.setItem.mock.calls.length).toBe(nativeWrites);
    const observed: string[] = [];
    window.addEventListener("storage", (event) => {
      observed.push(String(event.newValue));
    });
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-color-scheme", newValue: "dark" }),
    );
    expect(observed).toEqual([]);
  });
  it.each(["getItem", "removeItem", "clear", "key", "length"] as const)(
    "handles a late %s refusal without exposing native Storage brand errors",
    async (method) => {
      const twin = storageTwin();
      installStorage(twin);
      await run();
      if (method === "length")
        Object.defineProperty(twin, "length", {
          get: () => {
            throw new Error("denied");
          },
        });
      else
        twin[method].mockImplementation(() => {
          throw new Error("denied");
        });
      const actions = {
        getItem: () => localStorage.getItem("opencode-theme-id"),
        removeItem: () => localStorage.removeItem("missing"),
        clear: () => localStorage.clear(),
        key: () => localStorage.key(0),
        length: () => localStorage.length,
      };
      const expected = {
        getItem: "oc-2",
        removeItem: undefined,
        clear: undefined,
        key: "opencode-theme-id",
        length: 3,
      };
      expect(actions[method]()).toBe(expected[method]);
      expect(document.documentElement.dataset["preferencesStorage"]).toBe("tab");
      localStorage.setItem("key", "value");
      expect(localStorage.getItem("key")).toBe("value");
    },
  );
  it("normalizes cross-tab removal, clear and invalid values before provider listeners", async () => {
    await run();
    const observed: Array<[string | null, string | null]> = [];
    window.addEventListener("storage", (event) => {
      observed.push([event.key, event.newValue]);
    });
    for (const [key, value] of [
      ["opencode-theme-id", "__proto__"],
      ["opencode-color-scheme", "sepia"],
      ["opencode-stats-single-key-shortcuts", null],
    ] as const)
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
    expect(observed).toEqual(defaults);
    observed.length = 0;
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(observed).toEqual(defaults);
    observed.length = 0;
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "opencode-color-scheme",
        newValue: "dark",
        storageArea: window.sessionStorage,
      }),
    );
    expect(observed).toEqual([]);
    window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: "opaque" }));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "opencode-theme-id",
        newValue: "matrix",
        storageArea: native,
      }),
    );
    expect(observed).toEqual([
      ["other", "opaque"],
      ["opencode-theme-id", "matrix"],
    ]);
    expect(localStorage.getItem("opencode-color-scheme")).toBe("system");
    expect(localStorage.getItem("opencode-theme-id")).toBe("oc-2");
    observed.length = 0;
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-theme-css-light", newValue: "opaque" }),
    );
    expect(observed).toEqual([["opencode-theme-css-light", "opaque"]]);
  });
  it("remembers a valid other-tab choice across a later write refusal", async () => {
    const twin = storageTwin();
    installStorage(twin);
    await run();
    native.setItem("opencode-theme-id", "matrix");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-theme-id", newValue: "matrix" }),
    );
    twin.setItem.mockImplementation(() => {
      throw new Error("denied");
    });
    localStorage.setItem("opencode-color-scheme", "dark");
    expect(localStorage.getItem("opencode-theme-id")).toBe("matrix");
  });
  it("returns null for a missing ordinal when the native key method is refused late", async () => {
    const twin = storageTwin();
    installStorage(twin);
    await run();
    twin.key.mockImplementation(() => {
      throw new Error("denied");
    });
    expect(localStorage.key(99)).toBeNull();
    expect(localStorage.length).toBe(3);
  });
  it("forwards normalized values even if correcting the external write exhausts storage", async () => {
    const twin = storageTwin();
    installStorage(twin);
    await run();
    const observed: Array<string | null> = [];
    window.addEventListener("storage", (event) => {
      observed.push(event.newValue);
    });
    native.setItem("opencode-color-scheme", "sepia");
    twin.setItem.mockImplementation(() => {
      throw new Error("denied");
    });
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opencode-color-scheme", newValue: "sepia" }),
    );
    expect(observed).toEqual(["system"]);
    expect(localStorage.getItem("opencode-color-scheme")).toBe("system");
    expect(document.documentElement.dataset["preferencesStorage"]).toBe("tab");
  });
});
