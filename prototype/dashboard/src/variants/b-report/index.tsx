// PROTOTYPE B, Report: one scrolling report, not a sidebar of pages.
import { createMemo, createSignal, For, Show } from "solid-js";
import { totals, toolBreakdown } from "../../data/query";
import { PRESETS } from "../../data/time";
import { day, rangeLabel } from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";
import { FilterChips, FilterMenu } from "../../ui/filter-menu";
import { type Binding, HotkeySheet, useBindings } from "../../ui/hotkeys";
import { FixedChip, ShiftButton } from "../../ui/range-control";
import { Activity, Headline, OverTime } from "./usage";
import { Breakdowns, Reliability, Rhythm, Sessions } from "./details";
import reportStyles from "./report.css?inline";

const SECTIONS = [
  { id: "headline", label: "Headline", key: "H" },
  { id: "activity", label: "Activity", key: "A" },
  { id: "over-time", label: "Over time", key: "O" },
  { id: "breakdown", label: "Where it went", key: "W" },
  { id: "rhythm", label: "Rhythm", key: "R" },
  { id: "reliability", label: "Reliability & speed", key: "E" },
  { id: "sessions", label: "Sessions", key: "S" },
] as const;

export default function VariantB() {
  let root!: HTMLDivElement;
  const [current, setCurrent] = createSignal(0);
  const [help, setHelp] = createSignal(false);
  const [filterOpen, setFilterOpen] = createSignal(false);
  const t = createMemo(() => totals(dash.db(), dash.filters(), dash.range(), dash.firsts()));
  const tools = createMemo(() => toolBreakdown(dash.db(), dash.filters(), dash.range()));
  const jump = (index: number) => {
    const section = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, index))]!;
    root.querySelector(`#b-${section.id}`)?.scrollIntoView({ block: "start" });
    track();
  };
  const track = () => {
    const edge = root.getBoundingClientRect().top + 160;
    const index = SECTIONS.findLastIndex(
      (s) => (root.querySelector(`#b-${s.id}`)?.getBoundingClientRect().top ?? Infinity) <= edge,
    );
    setCurrent(Math.max(0, index));
  };
  const close = () => {
    setHelp(false);
    setFilterOpen(false);
  };
  const bindings: Binding[] = [
    ...SECTIONS.map((s, i) => ({
      sequence: ["G", s.key],
      label: s.label,
      group: "Jump to section",
      run: () => jump(i),
    })),
    { hotkey: "J", label: "Next section", group: "Reading", run: () => jump(current() + 1) },
    { hotkey: "K", label: "Previous section", group: "Reading", run: () => jump(current() - 1) },
    ...PRESETS.map((p, i) => ({
      hotkey: String(i + 1),
      label: p.long,
      group: "Time range",
      run: () => dash.setRange({ kind: "preset", preset: p.id }),
    })),
    { hotkey: "[", label: "Previous range", group: "Time range", run: () => dash.shift(-1) },
    { hotkey: "]", label: "Next range", group: "Time range", run: () => dash.shift(1) },
    {
      hotkey: "F",
      label: "Filter menu",
      group: "Filters & activity",
      run: () => setFilterOpen((v) => !v),
    },
    {
      hotkey: "C",
      label: "Cycle contribution metric",
      group: "Filters & activity",
      run: cycleContribution,
    },
    { hotkey: "?", label: "Keyboard shortcuts", group: "Help", run: () => setHelp((v) => !v) },
    { hotkey: "Escape", label: "Close", group: "Help", run: close },
  ];
  useBindings(bindings);

  return (
    <div
      class="b-report"
      ref={(element) => {
        root = element;
      }}
      onScroll={track}
    >
      <style>{reportStyles}</style>
      <header class="b-topbar">
        <div class="b-bar-inner">
          <div class="b-range-row">
            <span class="b-brand">
              opencode-stats <span class="faint">/ report</span>
            </span>
            <div class="b-presets" aria-label="Time range presets">
              <For each={PRESETS}>
                {(p) => (
                  <button
                    type="button"
                    class="b-text-control"
                    classList={{
                      "b-chosen":
                        dash.range().spec.kind === "preset" && rangeLabel(dash.range()) === p.long,
                    }}
                    onClick={() => dash.setRange({ kind: "preset", preset: p.id })}
                  >
                    {p.short}
                  </button>
                )}
              </For>
            </div>
            <div class="b-shifts">
              <ShiftButton dir={-1} />
              <ShiftButton dir={1} />
            </div>
            <Show when={dash.spec().kind === "preset"} fallback={<FixedChip />}>
              <span class="b-range-caption num">
                {rangeLabel(dash.range())} · {day(dash.range().start)} –{" "}
                {day(dash.range().axisEnd - 1)}
              </span>
            </Show>
            <div class="b-bar-actions">
              <FilterMenu open={filterOpen()} onOpenChange={setFilterOpen} />
              <button
                type="button"
                class="b-help"
                aria-label="Keyboard shortcuts"
                onClick={() => setHelp(true)}
              >
                ?
              </button>
            </div>
          </div>
          <div class="b-jump-row">
            <nav aria-label="Jump to report section" class="b-jumps">
              <For each={SECTIONS}>
                {(s, i) => (
                  <a
                    href={`#b-${s.id}`}
                    aria-current={current() === i() ? "location" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(i());
                    }}
                    title={`g ${s.key.toLowerCase()}`}
                  >
                    <span class="b-jump-number num">0{i() + 1}</span>
                    {s.label}
                  </a>
                )}
              </For>
            </nav>
            <span class="b-reading-hint">j / k to read</span>
          </div>
          <Show when={dash.activeFilters().length}>
            <div class="b-filter-row">
              <FilterChips />
              <Show when={dash.filters().tool?.length}>
                <span class="faint">Tool filter: tool calls only.</span>
              </Show>
            </div>
          </Show>
        </div>
      </header>
      <main class="b-paper oc-surface" aria-label="Usage report">
        <Headline totals={t()} />
        <Activity totals={t()} />
        <OverTime />
        <Breakdowns tools={tools()} />
        <Rhythm />
        <Reliability totals={t()} tools={tools()} />
        <Sessions />
        <footer class="b-footer">
          Read-only · Browser timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone} · No
          message content
        </footer>
      </main>
      <HotkeySheet open={help()} onClose={close} bindings={bindings} />
    </div>
  );
}

function cycleContribution() {
  const metrics = ["tokens", "steps", "cost"] as const;
  setContributionMetric(metrics[(metrics.indexOf(contributionMetric()) + 1) % metrics.length]!);
}
