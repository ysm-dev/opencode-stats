type Variant = { background: string; fingerprint: string };
type PrepaintThemes = Record<string, { light: Variant; dark: Variant }>;
export type PrepaintData = { themes: PrepaintThemes; properties: string[]; references: string[] };

const scheme = (value: string | null) => (value === "light" || value === "dark" ? value : "system");
const shortcuts = (value: string | null) => (value === "off" ? "off" : "on");
const fingerprint = (css: string) => {
  let crc = -1;
  for (let index = 0; index < css.length; index++) {
    crc ^= css.charCodeAt(index);
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return String((crc ^ -1) >>> 0);
};
// The checksum detects stale/wrong-theme caches; the grammar, not the checksum,
// is the security boundary. No rules, URLs, strings, HTML or arbitrary functions.
const safeCss = (css: string, properties: Set<string>, references: Set<string>) =>
  css.split(";").every((declaration) => {
    if (!declaration.trim()) return true;
    const colon = declaration.indexOf(":");
    const property = declaration.slice(0, colon).trim();
    if (!property.startsWith("--") || !properties.has(property.slice(2))) return false;
    let valid = true;
    const remaining = declaration
      .slice(colon + 1)
      .replace(/var\(--([^)]+)\)/g, (_match: string, reference: string) => {
        valid &&= references.has(reference);
        return "";
      })
      .replace(/#[\da-f]{6}(?:[\da-f]{2})?/gi, "")
      .replace(/rgba\([\d.,\s]+\)/g, "")
      .replace(/-?(?:\d*\.)?\d+px/g, "")
      .replace(/inset/g, "")
      .replace(/[\s,]/g, "");
    return valid && remaining === "";
  });

const guardStorage = () => {
  const root = document.documentElement;
  const mirror = new Map<string, string>();
  let persistent: Storage | undefined;
  const memory: Storage = {
    get length() {
      return mirror.size;
    },
    key: (index) => [...mirror.keys()][index] ?? null,
    getItem: (key) => mirror.get(key) ?? null,
    // The wrapper mirrors writes before trying native storage; don't do them twice.
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
  let active = memory;
  const refused = () => {
    persistent = undefined;
    active = memory;
    root.dataset["preferencesStorage"] = "tab";
    window.dispatchEvent(new Event("preferences-storage"));
  };
  try {
    persistent = window.localStorage;
    active = persistent;
  } catch {
    /* The completed startup reports tab memory; there is no live preference state yet. */
  }
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: Web Storage converts untrusted JavaScript keys to strings.
  const read = (input: unknown) => {
    const key = String(input);
    try {
      const value = active.getItem(key);
      if (value === null) mirror.delete(key);
      else mirror.set(key, value);
    } catch {
      refused();
    }
    return mirror.get(key) ?? null;
  };
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: Web Storage converts untrusted JavaScript keys/values to strings.
  const set = (input: unknown, data: unknown) => {
    const key = String(input);
    const value = String(data);
    mirror.set(key, value);
    try {
      active.setItem(key, value);
    } catch {
      refused();
    }
  };
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: Web Storage converts untrusted JavaScript keys to strings.
  const remove = (input: unknown) => {
    const key = String(input);
    mirror.delete(key);
    try {
      active.removeItem(key);
    } catch {
      refused();
    }
  };
  const storage: Storage = {
    get length() {
      try {
        return active.length;
      } catch {
        refused();
      }
      return mirror.size;
    },
    key: (index) => {
      try {
        return active.key(index);
      } catch {
        refused();
      }
      return [...mirror.keys()][index] ?? null;
    },
    getItem: read,
    setItem: set,
    removeItem: remove,
    clear: () => {
      mirror.clear();
      try {
        active.clear();
      } catch {
        refused();
      }
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  return {
    storage,
    read,
    set,
    remove,
    remember: (key: string, value: string) => {
      mirror.set(key, value);
    },
    native: () => persistent,
  };
};

const startupTools = { scheme, shortcuts, fingerprint, safeCss, guardStorage };

// Emitted as a synchronous classic head script, never a module entry.
export const startup = (data: PrepaintData, tools = startupTools) => {
  const { themes } = data;
  const properties = new Set(data.properties);
  const references = new Set(data.references);
  const root = document.documentElement;
  const guarded = tools.guardStorage();
  const { read, set, remove } = guarded;
  const keys = [
    "opencode-theme-id",
    "opencode-color-scheme",
    "opencode-stats-single-key-shortcuts",
    "opencode-theme-css-light",
    "opencode-theme-css-dark",
  ];
  for (const key of keys) read(key);
  const theme = (value: string | null) => (value && Object.hasOwn(themes, value) ? value : "oc-2");
  const normalizers = [theme, tools.scheme, tools.shortcuts];
  for (let index = 0; index < 3; index++)
    set(keys[index]!, normalizers[index]!(read(keys[index]!)));
  // Exercise remove as well as write; preserve an existing probe key, if any.
  const probe = "opencode-stats-storage-probe";
  const previous = read(probe);
  set(probe, probe);
  remove(probe);
  if (previous !== null) set(probe, previous);
  root.dataset["preferencesStorage"] = guarded.native() ? "persistent" : "tab";
  const id = theme(read(keys[0]!));
  for (const mode of ["light", "dark"] as const) {
    const key = `opencode-theme-css-${mode}`;
    const css = read(key);
    if (
      css &&
      (!tools.safeCss(css, properties, references) ||
        tools.fingerprint(css) !== themes[id]![mode].fingerprint ||
        id === "oc-2")
    )
      remove(key);
  }
  const preference = tools.scheme(read(keys[1]!));
  const mode =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  root.dataset["theme"] = id;
  root.dataset["colorScheme"] = mode;
  root.style.colorScheme = mode;
  root.style.backgroundColor = themes[id]![mode].background;
  root.style.setProperty("--dashboard-background", themes[id]![mode].background);
  const style = document.createElement("style");
  style.id = "oc-theme-preload";
  const css = read(`opencode-theme-css-${mode}`);
  style.textContent = `:root{color-scheme:${mode};--text-mix-blend-mode:${mode === "dark" ? "plus-lighter" : "multiply"};`;
  if (css) style.textContent += css;
  style.textContent += "}";
  document.head.append(style);
  // Capture before the provider. Normalize external writes/removal/clear at this
  // same trust boundary and forward only valid values to its published listener.
  let forwarding = false;
  const forward = (key: string, value: string) => {
    forwarding = true;
    try {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
    } finally {
      forwarding = false;
    }
  };
  window.addEventListener("storage", (event) => {
    if (forwarding) return;
    if (!guarded.native() || (event.storageArea && event.storageArea !== guarded.native())) {
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === null) {
      event.stopImmediatePropagation();
      for (let index = 0; index < 3; index++) forward(keys[index]!, normalizers[index]!(null));
      return;
    }
    const index = keys.slice(0, 3).indexOf(event.key);
    if (index < 0) return;
    const normalized = normalizers[index]!(event.newValue);
    guarded.remember(event.key, normalized);
    if (event.newValue !== normalized) {
      event.stopImmediatePropagation();
      set(event.key, normalized);
      forward(event.key, normalized);
    }
  });
};
