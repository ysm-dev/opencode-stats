import { createContext, createSignal, onCleanup, onMount, useContext } from "solid-js";
import type { ParentProps } from "solid-js";
import { ThemeProvider, useTheme } from "@opencode/ui/theme/context";
import type { DesktopTheme } from "@opencode/ui/theme";
import { dashboardPalette } from "./palette.ts";

const palettes = new WeakMap<DesktopTheme, [Record<string, string>, Record<string, string>]>();
const paletteFor = (theme: DesktopTheme, dark: boolean) => {
  let variants = palettes.get(theme);
  if (!variants) {
    variants = [dashboardPalette(theme, false), dashboardPalette(theme, true)];
    palettes.set(theme, variants);
  }
  return variants[dark ? 1 : 0];
};
const apply = (theme: DesktopTheme, mode: "light" | "dark") => {
  const palette = paletteFor(theme, mode === "dark");
  let style = document.getElementById("dashboard-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "dashboard-theme";
    document.head.append(style);
  }
  style.textContent = `:root{${Object.entries(palette)
    .map(([role, colour]) => `--dashboard-${role}:${colour};`)
    .join("")}}`;
  const root = document.documentElement;
  root.style.backgroundColor = palette["deep"]!;
  root.style.setProperty("--dashboard-background", palette["deep"]!);
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette["deep"]!);
};

const preferenceState = () => {
  const theme = useTheme();
  const [ready, setReady] = createSignal(false);
  const [singleKeyShortcuts, setSingleKeyShortcuts] = createSignal(
    localStorage.getItem("opencode-stats-single-key-shortcuts") !== "off",
  );
  const [keepsPreferences, setKeepsPreferences] = createSignal(
    document.documentElement.dataset["preferencesStorage"] !== "tab",
  );
  const storage = (event: StorageEvent) => {
    if (event.key === "opencode-stats-single-key-shortcuts")
      setSingleKeyShortcuts(event.newValue !== "off");
  };
  const refused = () => setKeepsPreferences(false);
  onMount(() => {
    window.addEventListener("storage", storage);
    window.addEventListener("preferences-storage", refused);
    void theme.loadThemes().then((themes) => {
      for (const value of Object.values(themes)) paletteFor(value, false);
      return setReady(true);
    });
  });
  onCleanup(() => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("preferences-storage", refused);
  });
  return {
    ready,
    singleKeyShortcuts,
    keepsPreferences,
    setSingleKeyShortcuts: (enabled: boolean) => {
      setSingleKeyShortcuts(enabled);
      localStorage.setItem("opencode-stats-single-key-shortcuts", enabled ? "on" : "off");
    },
  };
};
const Preferences = createContext<ReturnType<typeof preferenceState>>();
export const usePreferences = () => useContext(Preferences)!;
const State = (props: ParentProps) => (
  <Preferences.Provider value={preferenceState()}>{props.children}</Preferences.Provider>
);
export const PreferenceProvider = (props: ParentProps) => (
  <ThemeProvider defaultTheme="oc-2" onThemeApplied={apply}>
    <State>{props.children}</State>
  </ThemeProvider>
);
