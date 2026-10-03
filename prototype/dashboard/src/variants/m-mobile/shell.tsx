// PROTOTYPE: the three shells. Each grows into variant E's sidebar and header on desktop:
//  - Picker (F): OpenCode's settings screen folded. A top bar with a page-name menu and search,
//    a range bar with ‹ › and a Filters button that opens a sheet. Sidebar from 768px.
//  - Tabs (G): app-like. A bottom tab bar of pages, range and filters as sheets; an icon rail
//    from 600px, E's sidebar from 1024px. No on-screen command menu.
//  - Drawer (H): E's sidebar slides in from ☰; a search field, a preset strip and wrapping chips
//    head each page. Sidebar from 1024px.
import { Icon } from "@opencode/ui/icon";
import { createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import { PRESETS } from "../../data/time";
import { day, rangeLabel, time } from "../../format";
import {
  build,
  contributionMetric,
  dash,
  notUpdating,
  setContributionMetric,
  urlParam,
} from "../../state";
import { HotkeySheet, useBindings, type Binding } from "../../ui/hotkeys";
import { FixedChip, RangeControl } from "../../ui/range-control";
import { FilterChips, Filters } from "../e-v1/filters";
import { Palette } from "../e-v1/palette";
import { media, observeWidth, setContentWidth } from "./media";
import { Drawer, type IconName, Menu, Sheet } from "./overlay";
import { Pages } from "./pages";

export const PAGES: { id: Page; label: string; icon: IconName; key: string }[] = [
  { id: "overview", label: "Overview", icon: "window-analytics", key: "O" },
  { id: "models", label: "Models", icon: "code-slash", key: "M" },
  { id: "projects", label: "Projects", icon: "folder", key: "P" },
  { id: "agents", label: "Agents", icon: "status-active", key: "A" },
  { id: "tools", label: "Tools", icon: "settings-gear", key: "T" },
  { id: "sessions", label: "Sessions", icon: "bullet-list", key: "S" },
];
export type Page = "overview" | "models" | "projects" | "agents" | "tools" | "sessions";
export type SessionView = "day" | "table";

type Shell = ReturnType<typeof useShell>;

function useShell(openFilters: () => void) {
  const [page, setPage] = urlParam<Page>("page", "overview");
  const [sessions, setSessions] = urlParam<SessionView>("sessions", "day");
  const [help, setHelp] = createSignal(false);
  const [commands, setCommands] = createSignal(false);
  let search: HTMLInputElement | undefined;
  const close = () => {
    setHelp(false);
    setCommands(false);
    search?.blur();
  };
  const focusSearch = () => {
    if (search?.isConnected && search.offsetParent) return search.focus();
    openFilters();
    queueMicrotask(() => search?.focus());
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
    { hotkey: "/", label: "Search filter values", group: "Filters", run: focusSearch },
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
      run: () => page() === "sessions" && setSessions(sessions() === "day" ? "table" : "day"),
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
  return {
    page,
    setPage,
    sessions,
    setSessions,
    help,
    setHelp,
    commands,
    setCommands,
    bindings,
    close,
    setSearch: (el: HTMLInputElement) => (search = el),
    title: () => PAGES.find((p) => p.id === page())?.label ?? "Overview",
  };
}

const filterCount = () => dash.activeFilters().reduce((n, [, keys]) => n + keys.length, 0);
const preset = () => {
  const s = dash.spec();
  return s.kind === "preset" ? s.preset : null;
};

// The live dot turns grey and reads "Not updating" whenever the page's status line says so.
function LiveNote() {
  const [clock, setClock] = createSignal(Date.now());
  const timer = setInterval(() => setClock(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));
  const ago = () =>
    dash.lastWrite()
      ? `${Math.max(0, Math.floor((clock() - dash.lastWrite()) / 1000))} s ago`
      : "–";
  return (
    <span class="e-live" classList={{ "m-stale": notUpdating() }}>
      <i />
      {notUpdating() ? "Not updating" : `Last write ${ago()}`}
    </span>
  );
}

/** Narrow shells: the live dot sits in the top bar, which never scrolls away. */
function LiveDot() {
  const [clock, setClock] = createSignal(Date.now());
  const timer = setInterval(() => setClock(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));
  const ago = () =>
    dash.lastWrite() ? `${Math.max(0, Math.floor((clock() - dash.lastWrite()) / 1000))} s` : "live";
  return (
    <span
      class="m-live"
      classList={{ "m-stale": notUpdating() }}
      title="Time since OpenCode's last write"
    >
      <i />
      {notUpdating() ? "Not updating" : ago()}
    </span>
  );
}

function Sidebar(props: { s: Shell; onNavigate?: () => void }) {
  return (
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
                aria-current={props.s.page() === p.id ? "page" : undefined}
                onClick={() => {
                  props.s.setPage(p.id);
                  props.onNavigate?.();
                }}
              >
                <Icon name={p.icon} size="small" />
                <span class="flex-1">{p.label}</span>
                <kbd>g {p.key.toLowerCase()}</kbd>
              </button>
            )}
          </For>
        </nav>
        <Filters inputRef={props.s.setSearch} />
      </div>
      <footer class="e-sidebar-footer">
        <LiveNote />
        <button type="button" onClick={() => props.s.setCommands(true)}>
          <kbd>⌘K</kbd> Commands
        </button>
        <button type="button" class="m-keys-only" onClick={() => props.s.setHelp(true)}>
          <kbd>?</kbd> Shortcuts
        </button>
      </footer>
    </aside>
  );
}

/**
 * The page's status line, one message at a time, in the wording of "How does opencode-stats
 * report problems?". Narrow, it wraps to as many lines as it needs: nothing is cut short.
 */
export function BuildLine() {
  const since = () => time(dash.now() - 23 * 60_000);
  const line = () => {
    const from = dash.historyFrom();
    const history = from === null ? "" : `History from ${day(from)} · `;
    switch (build()) {
      case "on":
        return `${history}older history is still being read`;
      case "stopped":
        return `${history}not updating since ${since()} · OpenCode's database is newer than opencode-stats 1.3.0 understands · run opencode plugin update opencode-stats`;
      case "stale":
        return `Not updating since ${since()} · can't read OpenCode's database: permission denied`;
      case "lost":
        return `Not updating since ${since()} · the dashboard server isn't running`;
      default:
        return "";
    }
  };
  return (
    <Show when={line()}>
      <p class="m-build" classList={{ "m-warn": notUpdating() }} role="status">
        {line()}
      </p>
    </Show>
  );
}

function DesktopHeader(props: { s: Shell }) {
  return (
    <header class="e-header">
      <div class="e-title-row">
        <h1>{props.s.title()}</h1>
        <RangeControl />
      </div>
      <FilterChips />
      <BuildLine />
    </header>
  );
}

function ShiftButton(props: { dir: -1 | 1 }) {
  return (
    <button
      type="button"
      class="m-icon-button"
      disabled={!dash.canShift(props.dir)}
      onClick={() => dash.shift(props.dir)}
      aria-label={props.dir < 0 ? "Previous range" : "Next range"}
    >
      <Icon name={props.dir < 0 ? "chevron-left" : "chevron-right"} size="small" />
    </button>
  );
}

function FiltersButton(props: { onClick: () => void }) {
  return (
    <button type="button" class="m-context-button" onClick={() => props.onClick()}>
      <Icon name="outline-sliders" size="small" />
      Filters
      <Show when={filterCount()}>
        <span class="m-count num">{filterCount()}</span>
      </Show>
    </button>
  );
}

function ClearAll() {
  return (
    <Show when={filterCount()}>
      <button type="button" class="m-sheet-clear" onClick={() => dash.clearFilters()}>
        Clear all
      </button>
    </Show>
  );
}

/** The scrolling page column. Its content width drives every narrow form inside it. */
function Scroller(props: { children: JSX.Element; context?: JSX.Element }) {
  return (
    <div class="m-scroll">
      {props.context}
      <div class="m-content" ref={(el) => observeWidth(el, setContentWidth)}>
        {props.children}
      </div>
      <div class="e-footnote">Read-only · Browser timezone · No message content</div>
    </div>
  );
}

function Overlays(props: { s: Shell }) {
  return (
    <>
      <Show when={props.s.commands()}>
        <Palette
          go={props.s.setPage}
          setSessions={props.s.setSessions}
          onClose={() => props.s.setCommands(false)}
        />
      </Show>
      <HotkeySheet open={props.s.help()} onClose={props.s.close} bindings={props.s.bindings} />
    </>
  );
}

function PageContent(props: { s: Shell }) {
  return (
    <Pages
      page={props.s.page()}
      go={props.s.setPage}
      sessions={props.s.sessions()}
      setSessions={props.s.setSessions}
    />
  );
}

export function PickerShell() {
  const wide = media("(min-width: 768px)");
  const [filters, setFilters] = createSignal(false);
  const s = useShell(() => setFilters(true));
  return (
    <div class="m-root e-root" data-shell="picker" classList={{ "m-wide": wide() }}>
      <Show when={wide()}>
        <Sidebar s={s} />
      </Show>
      <main class="m-main">
        <Show
          when={wide()}
          fallback={
            <div class="m-bars">
              <header class="m-bar">
                <span class="c-logo">S</span>
                <Menu
                  ariaLabel="Page"
                  class="m-picker"
                  label={<span>{s.title()}</span>}
                  value={s.page()}
                  options={PAGES.map((p) => ({
                    value: p.id,
                    label: p.label,
                    icon: p.icon,
                    hint: `g ${p.key.toLowerCase()}`,
                  }))}
                  onSelect={s.setPage}
                />
                <span class="m-gap" />
                <LiveDot />
                <button
                  type="button"
                  class="m-icon-button"
                  aria-label="Search pages, ranges and filters"
                  onClick={() => s.setCommands(true)}
                >
                  <Icon name="magnifying-glass" size="small" />
                </button>
              </header>
              <div class="m-rangebar">
                <ShiftButton dir={-1} />
                <Menu
                  ariaLabel="Time range"
                  class="m-range-button"
                  label={<span class="num">{rangeLabel(dash.range())}</span>}
                  value={preset()}
                  options={PRESETS.map((p, i) => ({
                    value: p.id,
                    label: p.long,
                    hint: String(i + 1),
                  }))}
                  onSelect={(v) => dash.setRange({ kind: "preset", preset: v })}
                />
                <ShiftButton dir={1} />
                <span class="m-gap" />
                <FiltersButton onClick={() => setFilters(true)} />
              </div>
            </div>
          }
        >
          <DesktopHeader s={s} />
        </Show>
        <Scroller
          context={
            <Show when={!wide()}>
              <div class="m-context">
                <div class="m-chips-scroll">
                  <FilterChips />
                </div>
                <BuildLine />
              </div>
            </Show>
          }
        >
          <PageContent s={s} />
        </Scroller>
      </main>
      <Sheet
        open={filters() && !wide()}
        title="Filters"
        onClose={() => setFilters(false)}
        actions={<ClearAll />}
      >
        <Filters inputRef={s.setSearch} />
      </Sheet>
      <Overlays s={s} />
    </div>
  );
}

export function TabsShell() {
  const wide = media("(min-width: 1024px)");
  const rail = media("(min-width: 600px)");
  const [filters, setFilters] = createSignal(false);
  const [range, setRange] = createSignal(false);
  const s = useShell(() => setFilters(true));
  return (
    <div
      class="m-root e-root"
      data-shell="tabs"
      classList={{ "m-wide": wide(), "m-rail": rail() && !wide() }}
    >
      <Show when={wide()}>
        <Sidebar s={s} />
      </Show>
      <Show when={rail() && !wide()}>
        <nav class="m-railnav" aria-label="Pages">
          <span class="c-logo">S</span>
          <For each={PAGES}>
            {(p) => (
              <button
                type="button"
                class="m-rail-item"
                aria-current={s.page() === p.id ? "page" : undefined}
                onClick={() => s.setPage(p.id)}
              >
                <Icon name={p.icon} size="small" />
                <span>{p.label}</span>
              </button>
            )}
          </For>
        </nav>
      </Show>
      <main class="m-main">
        <Show
          when={wide()}
          fallback={
            <div class="m-bars">
              <header class="m-tabs-head">
                <h1>{s.title()}</h1>
                <span class="m-gap" />
                <LiveDot />
              </header>
              <div class="m-context-bar">
                <button type="button" class="m-context-button" onClick={() => setRange(true)}>
                  <span class="num">{rangeLabel(dash.range())}</span>
                  <Icon name="chevron-down" size="small" />
                </button>
                <FiltersButton onClick={() => setFilters(true)} />
              </div>
            </div>
          }
        >
          <DesktopHeader s={s} />
        </Show>
        <Scroller
          context={
            <Show when={!wide()}>
              <div class="m-context">
                <div class="m-chips-scroll">
                  <FilterChips />
                </div>
                <BuildLine />
              </div>
            </Show>
          }
        >
          <PageContent s={s} />
        </Scroller>
        <Show when={!rail()}>
          <nav class="m-tabbar" aria-label="Pages">
            <For each={PAGES}>
              {(p) => (
                <button
                  type="button"
                  class="m-tab"
                  aria-current={s.page() === p.id ? "page" : undefined}
                  onClick={() => s.setPage(p.id)}
                >
                  <Icon name={p.icon} size="small" />
                  <span>{p.label}</span>
                </button>
              )}
            </For>
          </nav>
        </Show>
      </main>
      <Sheet open={range() && !wide()} title="Time range" onClose={() => setRange(false)}>
        <div class="m-range-sheet">
          <div class="m-preset-grid">
            <For each={PRESETS}>
              {(p) => (
                <button
                  type="button"
                  aria-pressed={preset() === p.id}
                  onClick={() => {
                    dash.setRange({ kind: "preset", preset: p.id });
                    setRange(false);
                  }}
                >
                  {p.long}
                </button>
              )}
            </For>
          </div>
          <div class="m-shift-row">
            <button type="button" disabled={!dash.canShift(-1)} onClick={() => dash.shift(-1)}>
              ‹ Previous
            </button>
            <span class="num">{rangeLabel(dash.range())}</span>
            <button type="button" disabled={!dash.canShift(1)} onClick={() => dash.shift(1)}>
              Next ›
            </button>
          </div>
          <p class="faint">Tap a bar or a day of the contribution graph for a fixed range.</p>
        </div>
      </Sheet>
      <Sheet
        open={filters() && !wide()}
        title="Filters"
        onClose={() => setFilters(false)}
        actions={<ClearAll />}
      >
        <Filters inputRef={s.setSearch} />
      </Sheet>
      <Overlays s={s} />
    </div>
  );
}

export function DrawerShell() {
  const wide = media("(min-width: 1024px)");
  const [drawer, setDrawer] = createSignal(false);
  const s = useShell(() => setDrawer(true));
  return (
    <div class="m-root e-root" data-shell="drawer" classList={{ "m-wide": wide() }}>
      <Show when={wide()}>
        <Sidebar s={s} />
      </Show>
      <main class="m-main">
        <Show
          when={wide()}
          fallback={
            <div class="m-bars">
              <header class="m-bar">
                <button
                  type="button"
                  class="m-icon-button m-menu-button"
                  aria-label="Pages and filters"
                  onClick={() => setDrawer(true)}
                >
                  <Icon name="menu" size="small" />
                  <Show when={filterCount()}>
                    <span class="m-dot" />
                  </Show>
                </button>
                <h1 class="m-bar-title">{s.title()}</h1>
                <span class="m-gap" />
                <LiveDot />
              </header>
            </div>
          }
        >
          <DesktopHeader s={s} />
        </Show>
        <Scroller
          context={
            <Show when={!wide()}>
              <div class="m-context">
                <button type="button" class="m-searchfield" onClick={() => s.setCommands(true)}>
                  <Icon name="magnifying-glass" size="small" />
                  <span>Search pages, ranges and filters</span>
                </button>
                <div class="m-strip">
                  <ShiftButton dir={-1} />
                  <div class="m-strip-scroll">
                    <For each={PRESETS}>
                      {(p) => (
                        <button
                          type="button"
                          class="m-strip-chip"
                          aria-pressed={preset() === p.id}
                          onClick={() => dash.setRange({ kind: "preset", preset: p.id })}
                        >
                          {p.short}
                        </button>
                      )}
                    </For>
                  </div>
                  <ShiftButton dir={1} />
                </div>
                <Show when={!preset()}>
                  <div class="m-fixed">
                    <FixedChip />
                  </div>
                </Show>
                <FilterChips />
                <BuildLine />
              </div>
            </Show>
          }
        >
          <PageContent s={s} />
        </Scroller>
      </main>
      <Drawer open={drawer() && !wide()} onClose={() => setDrawer(false)}>
        <Sidebar s={s} onNavigate={() => setDrawer(false)} />
      </Drawer>
      <Overlays s={s} />
    </div>
  );
}
