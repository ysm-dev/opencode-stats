// PROTOTYPE D: contribution graph → local-day journal. Read-only, invented history.
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { PRESETS, addDays, dayKey, startOfDay, startOfMonth, startOfWeek } from "../../data/time";
import { day, rangeLabel } from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";
import { FilterChips, FilterMenu } from "../../ui/filter-menu";
import { type Binding, HotkeySheet, useBindings } from "../../ui/hotkeys";
import { ShiftButton } from "../../ui/range-control";
import { YearGraph } from "./year-graph";
import { Journal } from "./journal";
import { Summary } from "./summary";
import styles from "./calendar.css?inline";
import graphStyles from "./graph.css?inline";

export function selectDay(t: number) {
  if (startOfDay(t) > startOfDay(dash.now())) return;
  dash.setRange({ kind: "fixed", unit: "day", start: dayKey(t) });
}

function selectedDay() {
  return Math.min(dash.range().axisEnd - 1, startOfDay(dash.now()));
}

const includesToday = () =>
  dash.range().start <= dash.now() && dash.range().axisEnd > startOfDay(dash.now());

export default function VariantD() {
  const [help, setHelp] = createSignal(false);
  const [filters, setFilters] = createSignal(false);
  const [anchor, setAnchor] = createSignal(selectedDay());
  createEffect(() => {
    if (dash.range().days === 1) setAnchor(dash.range().start);
  });
  const navigateDay = (t: number) => {
    if (t > dash.now()) return;
    setAnchor(t);
    selectDay(t);
  };
  const bindings: Binding[] = [
    ...PRESETS.map((p, i) => ({
      hotkey: String(i + 1),
      label: p.long,
      group: "Presets",
      run: () => dash.setRange({ kind: "preset", preset: p.id }),
    })),
    {
      hotkey: "H",
      label: "Previous day",
      group: "Navigate",
      run: () => navigateDay(addDays(anchor(), -1)),
    },
    {
      hotkey: "L",
      label: "Next day",
      group: "Navigate",
      run: () => navigateDay(addDays(anchor(), 1)),
    },
    {
      hotkey: "W",
      label: "Containing week",
      group: "Navigate",
      run: () =>
        dash.setRange({ kind: "fixed", unit: "week", start: dayKey(startOfWeek(anchor())) }),
    },
    {
      hotkey: "M",
      label: "Containing month",
      group: "Navigate",
      run: () =>
        dash.setRange({ kind: "fixed", unit: "month", start: dayKey(startOfMonth(anchor())) }),
    },
    {
      hotkey: "T",
      label: "Today",
      group: "Navigate",
      run: () => dash.setRange({ kind: "preset", preset: "today" }),
    },
    { hotkey: "[", label: "Shift previous", group: "Navigate", run: () => dash.shift(-1) },
    { hotkey: "]", label: "Shift next", group: "Navigate", run: () => dash.shift(1) },
    { hotkey: "F", label: "Filter", group: "Controls", run: () => setFilters(true) },
    {
      hotkey: "C",
      label: "Cycle graph metric",
      group: "Controls",
      run: () =>
        setContributionMetric(
          contributionMetric() === "tokens"
            ? "steps"
            : contributionMetric() === "steps"
              ? "cost"
              : "tokens",
        ),
    },
    { hotkey: "?", label: "Keyboard shortcuts", group: "Controls", run: () => setHelp((v) => !v) },
    {
      hotkey: "Escape",
      label: "Close",
      group: "Controls",
      run: () => {
        setHelp(false);
        setFilters(false);
      },
    },
  ];
  useBindings(bindings);
  return (
    <main class="d-root">
      <style>
        {graphStyles}
        {styles}
      </style>
      <header class="d-brand">
        <span class="d-mark">S</span>
        <span>
          opencode-stats <span class="faint">/ journal</span>
        </span>
        <button type="button" class="d-text-button" onClick={() => setHelp(true)}>
          Shortcuts <kbd>?</kbd>
        </button>
      </header>
      <section class="oc-surface d-year">
        <YearGraph onDay={navigateDay} />
      </section>
      <header class="d-range-header">
        <div class="d-presets">
          <For each={PRESETS}>
            {(p, i) => (
              <>
                <Show when={i() > 0}>
                  <span class="faint">·</span>
                </Show>
                <button
                  type="button"
                  aria-pressed={
                    dash.spec().kind === "preset" && rangeLabel(dash.range()) === p.long
                  }
                  onClick={() => dash.setRange({ kind: "preset", preset: p.id })}
                >
                  {p.short}
                </button>
              </>
            )}
          </For>
        </div>
        <div class="d-range-line">
          <div>
            <div class="d-eyebrow">
              YOUR LOCAL TIME{" "}
              <span> {dash.spec().kind === "fixed" ? "· FIXED RANGE" : "· PRESET"}</span>
            </div>
            <h1>{rangeLabel(dash.range())}</h1>
            <div class="faint text-[12px]">
              {day(dash.range().start, { year: true })} –{" "}
              {day(dash.range().axisEnd - 1, { year: true })} ·{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </div>
          </div>
          <div class="d-range-actions">
            <LiveNote />
            <ShiftButton dir={-1} />
            <ShiftButton dir={1} />
            <FilterMenu open={filters()} onOpenChange={setFilters} />
          </div>
        </div>
        <FilterChips />
        <Show when={dash.filters().tool?.length}>
          <span class="faint text-[12px]">Tool filter applies to tool calls only.</span>
        </Show>
      </header>
      <div class="d-detail">
        <Journal />
        <Summary />
      </div>
      <HotkeySheet open={help()} onClose={() => setHelp(false)} bindings={bindings} />
    </main>
  );
}

function LiveNote() {
  const [clock, setClock] = createSignal(Date.now());
  const timer = setInterval(() => setClock(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));
  return (
    <Show when={includesToday()}>
      <span class="d-live">
        <span />
        {dash.lastWrite()
          ? `updated ${Math.max(0, Math.floor((clock() - dash.lastWrite()) / 1000))} s ago`
          : "live · awaiting next write"}
      </span>
    </Show>
  );
}
