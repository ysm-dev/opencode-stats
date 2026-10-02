import { Icon } from "@opencode/ui/icon";
import { createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { PRESETS } from "../../data/time";
import { contributionMetric, dash, setContributionMetric, urlParam } from "../../state";
import { HotkeySheet, useBindings, type Binding } from "../../ui/hotkeys";
import { RangeControl } from "../../ui/range-control";
import aStyles from "../a-pages/a.css?inline";
import bStyles from "../b-report/report.css?inline";
import cStyles from "../c-explorer/c.css?inline";
import dStyles from "../d-calendar/calendar.css?inline";
import graphStyles from "../d-calendar/graph.css?inline";
import { Filters, FilterChips } from "./filters";
import { Overview } from "./overview";
import { Palette } from "./palette";
import { DimensionPage, SessionsPage, ToolsPage } from "./pages";
import styles from "./e.css?inline";

export const PAGES = [
  { id: "overview", label: "Overview", icon: "window-analytics", key: "O" },
  { id: "models", label: "Models", icon: "code-slash", key: "M" },
  { id: "projects", label: "Projects", icon: "folder", key: "P" },
  { id: "agents", label: "Agents", icon: "status-active", key: "A" },
  { id: "tools", label: "Tools", icon: "settings-gear", key: "T" },
  { id: "sessions", label: "Sessions", icon: "menu", key: "S" },
] as const;
export type Page = (typeof PAGES)[number]["id"];
export type SessionView = "day" | "table";

export default function VariantE() {
  const [page, setPage] = urlParam<Page>("page", "overview");
  const [sessions, setSessions] = urlParam<SessionView>("sessions", "day");
  const [help, setHelp] = createSignal(false);
  const [commands, setCommands] = createSignal(false);
  let search!: HTMLInputElement;
  const close = () => {
    setHelp(false);
    setCommands(false);
    search?.blur();
  };
  const bindings: Binding[] = [
    ...PAGES.map((p) => ({
      sequence: ["G", p.key],
      label: p.label,
      group: "Go to",
      run: () => setPage(p.id),
    })),
    ...PRESETS.map((p, i) => ({
      hotkey: String(i + 1),
      label: p.long,
      group: "Range",
      run: () => dash.setRange({ kind: "preset", preset: p.id }),
    })),
    { hotkey: "[", label: "Previous range", group: "Range", run: () => dash.shift(-1) },
    { hotkey: "]", label: "Next range", group: "Range", run: () => dash.shift(1) },
    { hotkey: "/", label: "Search filter values", group: "Filters", run: () => search.focus() },
    { hotkey: "Shift+X", label: "Clear filters", group: "Filters", run: () => dash.clearFilters() },
    {
      hotkey: "C",
      label: "Cycle contribution metric",
      group: "Overview",
      run: () => {
        if (page() !== "overview") return;
        const metrics = ["tokens", "steps", "cost"] as const;
        setContributionMetric(metrics[(metrics.indexOf(contributionMetric()) + 1) % 3]!);
      },
    },
    {
      hotkey: "V",
      label: "Toggle By day / Table",
      group: "Sessions",
      run: () => {
        if (page() === "sessions") setSessions(sessions() === "day" ? "table" : "day");
      },
    },
    {
      hotkey: "Mod+K",
      label: "Commands",
      group: "Help",
      run: () => {
        setHelp(false);
        setCommands((v) => !v);
      },
    },
    {
      hotkey: "?",
      label: "Keyboard shortcuts",
      group: "Help",
      run: () => {
        setCommands(false);
        setHelp((v) => !v);
      },
    },
    { hotkey: "Escape", label: "Close", group: "Help", run: close },
  ];
  useBindings(bindings);
  // Shared bindings ignore inputs; Escape and the global command chord still work while searching.
  const inputKeys = (e: KeyboardEvent) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (e.key === "Escape") close();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setCommands((v) => !v);
    }
  };
  document.addEventListener("keydown", inputKeys);
  onCleanup(() => document.removeEventListener("keydown", inputKeys));
  return (
    <div class="a-root e-root">
      <style>
        {aStyles}
        {bStyles}
        {cStyles}
        {dStyles}
        {graphStyles}
        {styles}
      </style>
      <aside class="e-sidebar">
        <div class="e-sidebar-scroll">
          <div class="e-brand">
            <span class="c-logo">S</span>opencode-stats<span class="e-v1">v1</span>
          </div>
          <nav aria-label="Pages" class="e-pages">
            <For each={PAGES}>
              {(p) => (
                <button
                  type="button"
                  class="a-nav-item"
                  aria-current={page() === p.id ? "page" : undefined}
                  onClick={() => setPage(p.id)}
                >
                  <Icon name={p.icon} size="small" />
                  <span class="flex-1">{p.label}</span>
                  <kbd>g {p.key.toLowerCase()}</kbd>
                </button>
              )}
            </For>
          </nav>
          <Filters
            inputRef={(el) => {
              search = el;
            }}
          />
        </div>
        <footer class="e-sidebar-footer">
          <LiveNote />
          <button type="button" onClick={() => setCommands(true)}>
            <kbd>⌘K</kbd> Commands
          </button>
          <button type="button" onClick={() => setHelp(true)}>
            <kbd>?</kbd> Shortcuts
          </button>
        </footer>
      </aside>
      <main class="a-main oc-surface e-main">
        <header class="e-header">
          <div class="e-title-row">
            <h1>{PAGES.find((p) => p.id === page())?.label ?? "Overview"}</h1>
            <RangeControl />
          </div>
          <FilterChips />
        </header>
        <div class="a-scroll e-scroll">
          <Switch>
            <Match when={page() === "overview"}>
              <Overview go={setPage} />
            </Match>
            <Match when={page() === "models"}>
              <DimensionPage dim="model" />
            </Match>
            <Match when={page() === "projects"}>
              <DimensionPage dim="project" />
            </Match>
            <Match when={page() === "agents"}>
              <DimensionPage dim="agent" />
            </Match>
            <Match when={page() === "tools"}>
              <ToolsPage />
            </Match>
            <Match when={page() === "sessions"}>
              <SessionsPage view={sessions()} setView={setSessions} />
            </Match>
          </Switch>
          <div class="e-footnote">Read-only · Browser timezone · No message content</div>
        </div>
      </main>
      <Show when={commands()}>
        <Palette go={setPage} setSessions={setSessions} onClose={() => setCommands(false)} />
      </Show>
      <HotkeySheet open={help()} onClose={close} bindings={bindings} />
    </div>
  );
}

function LiveNote() {
  const [clock, setClock] = createSignal(Date.now());
  const timer = setInterval(() => setClock(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));
  const ago = () =>
    dash.lastWrite()
      ? `${Math.max(0, Math.floor((clock() - dash.lastWrite()) / 1000))} s ago`
      : "–";
  return (
    <span class="e-live">
      <i />
      Last write {ago()}
    </span>
  );
}
