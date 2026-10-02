// PROTOTYPE variant A, "Pages": OpenCode's settings layout. A sidebar of pages (Overview,
// Models, Projects, Agents, Tools, Sessions); range and filters sit in every page's header.
import { Icon } from "@opencode/ui/icon";
import { Keybind } from "@opencode/ui/keybind";
import { createSignal, For, Match, Switch } from "solid-js";
import { type Preset, PRESETS } from "../../data/time";
import { dash, setContributionMetric, contributionMetric, urlParam } from "../../state";
import { FilterChips, FilterMenu } from "../../ui/filter-menu";
import { type Binding, HotkeySheet, useBindings } from "../../ui/hotkeys";
import { RangeControl } from "../../ui/range-control";
import { Overview } from "./overview";
import { DimensionPage, SessionsPage, ToolsPage } from "./pages";
import "./a.css";

const PAGES = [
  { id: "overview", label: "Overview", icon: "window-analytics", key: "O" },
  { id: "models", label: "Models", icon: "code-slash", key: "M" },
  { id: "projects", label: "Projects", icon: "folder", key: "P" },
  { id: "agents", label: "Agents", icon: "status-active", key: "A" },
  { id: "tools", label: "Tools", icon: "settings-gear", key: "T" },
  { id: "sessions", label: "Sessions", icon: "menu", key: "S" },
] as const;

type Page = (typeof PAGES)[number]["id"];

export default function VariantA() {
  const [page, setPage] = urlParam<Page>("page", "overview");
  const [help, setHelp] = createSignal(false);
  const [filterOpen, setFilterOpen] = createSignal(false);
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
      group: "Time range",
      run: () => dash.setRange({ kind: "preset", preset: p.id as Preset }),
    })),
    { hotkey: "[", label: "Previous range", group: "Time range", run: () => dash.shift(-1) },
    { hotkey: "]", label: "Next range", group: "Time range", run: () => dash.shift(1) },
    { hotkey: "F", label: "Add filter", group: "Filters", run: () => setFilterOpen(true) },
    { hotkey: "Shift+X", label: "Clear filters", group: "Filters", run: () => dash.clearFilters() },
    {
      hotkey: "C",
      label: "Cycle contribution metric",
      group: "Filters",
      run: () =>
        setContributionMetric(
          contributionMetric() === "tokens"
            ? "steps"
            : contributionMetric() === "steps"
              ? "cost"
              : "tokens",
        ),
    },
    { hotkey: "?", label: "Keyboard shortcuts", group: "Help", run: () => setHelp((v) => !v) },
    { hotkey: "Escape", label: "Close", group: "Help", run: () => setHelp(false) },
  ];
  useBindings(bindings);
  const title = () => PAGES.find((p) => p.id === page())!.label;

  return (
    <div class="a-root">
      <nav class="a-nav" aria-label="Pages">
        <div class="mb-4 flex h-8 items-center gap-2 px-1.5">
          <span class="flex h-5 w-5 items-center justify-center rounded-[5px] bg-v2-background-bg-inverse text-[11px] font-bold text-v2-text-text-inverse">
            S
          </span>
          <span class="font-medium">opencode-stats</span>
        </div>
        <For each={PAGES}>
          {(p) => (
            <button
              type="button"
              class="a-nav-item"
              aria-current={page() === p.id ? "page" : undefined}
              onClick={() => setPage(p.id)}
            >
              <Icon name={p.icon as never} size="small" />
              <span class="flex-1">{p.label}</span>
              <span class="text-[11px] text-v2-text-text-faint opacity-0 [.a-nav-item:hover_&]:opacity-100">
                g {p.key.toLowerCase()}
              </span>
            </button>
          )}
        </For>
        <div class="mt-auto flex flex-col gap-2 px-1.5 text-[12px] text-v2-text-text-faint">
          <LiveNote />
          <button
            type="button"
            class="flex items-center gap-2 hover:text-v2-text-text-base"
            onClick={() => setHelp(true)}
          >
            <Keybind keys={["?"]} /> Shortcuts
          </button>
        </div>
      </nav>
      <main class="a-main oc-surface">
        <header class="flex flex-col gap-2 px-6 pb-3 pt-4">
          <div class="flex items-center justify-between gap-4">
            <h1 class="text-[16px] font-medium">{title()}</h1>
            <div class="flex items-center gap-1">
              <FilterMenu
                open={filterOpen()}
                onOpenChange={setFilterOpen}
                dims={
                  page() === "tools"
                    ? undefined
                    : ["project", "provider", "model", "variant", "agent", "session"]
                }
              />
              <RangeControl />
            </div>
          </div>
          <FilterChips />
        </header>
        <div class="a-scroll">
          <Switch>
            <Match when={page() === "overview"}>
              <Overview go={(p) => setPage(p as Page)} />
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
              <SessionsPage />
            </Match>
          </Switch>
        </div>
      </main>
      <HotkeySheet open={help()} onClose={() => setHelp(false)} bindings={bindings} />
    </div>
  );
}

function LiveNote() {
  const ago = () => {
    const s = Math.round((dash.now() - dash.lastWrite()) / 1000);
    return dash.lastWrite() ? (s < 60 ? "just now" : `${Math.round(s / 60)} min ago`) : "–";
  };
  return (
    <span class="flex items-center gap-2" title="New OpenCode activity appears without a refresh">
      <span
        class="h-1.5 w-1.5 rounded-full"
        style={{ background: dash.live() ? "var(--outcome-succeeded)" : "var(--outcome-stopped)" }}
      />
      Last write {ago()}
    </span>
  );
}
