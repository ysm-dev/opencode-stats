import { Icon } from "@opencode/ui/icon";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { dimensionValues, DIMENSIONS } from "../../data/query";
import { PRESETS } from "../../data/time";
import { dash, setContributionMetric } from "../../state";
import { PAGES, type Page, type SessionView } from "./index";

interface Action {
  label: string;
  run: () => void;
  group: string;
}

export function Palette(props: {
  go: (p: Page) => void;
  setSessions: (v: SessionView) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  let input!: HTMLInputElement;
  let list!: HTMLDivElement;
  const origin = document.activeElement;
  const actions = createMemo<Action[]>(() => [
    ...PAGES.map((p) => ({ label: `Go to ${p.label}`, group: "Page", run: () => props.go(p.id) })),
    ...PRESETS.map((p) => ({
      label: `Range: ${p.long}`,
      group: "Range",
      run: () => dash.setRange({ kind: "preset", preset: p.id }),
    })),
    { label: "Previous range", group: "Range", run: () => dash.shift(-1) },
    { label: "Next range", group: "Range", run: () => dash.shift(1) },
    { label: "Clear filters", group: "Filters", run: () => dash.clearFilters() },
    ...(["tokens", "steps", "cost"] as const).map((metric) => ({
      label: `Contribution metric: ${metric[0]!.toUpperCase()}${metric.slice(1)}`,
      group: "Overview",
      run: () => setContributionMetric(metric),
    })),
    ...(["day", "table"] as const).map((view) => ({
      label: `Sessions view: ${view === "day" ? "By day" : "Table"}`,
      group: "Sessions",
      run: () => {
        props.setSessions(view);
        props.go("sessions");
      },
    })),
    ...DIMENSIONS.flatMap((d) =>
      dimensionValues(dash.db(), d.id).map((v) => ({
        label: `Filter ${d.id}: ${v.label}${v.sub ? ` · ${v.sub}` : ""}${d.id === "tool" ? " · tool calls only" : ""}`,
        group: dash.filters()[d.id]?.includes(v.key) ? "Remove filter" : "Add filter",
        run: () => dash.toggleFilter(d.id, v.key),
      })),
    ),
  ]);
  const filtered = createMemo(() =>
    actions()
      .filter((a) => a.label.toLowerCase().includes(query().toLowerCase()))
      .slice(0, 80),
  );
  onMount(() => input.focus());
  onCleanup(() => {
    if (origin instanceof HTMLElement) origin.focus();
  });
  function run(action: Action | undefined) {
    if (action) {
      action.run();
      props.onClose();
    }
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      run(filtered()[index()]);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      input.focus();
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const count = filtered().length;
    if (!count) return;
    setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
    list.children[index()]?.scrollIntoView({ block: "nearest" });
  }
  return (
    <div class="c-palette-scrim" onClick={props.onClose}>
      <div
        class="c-palette oc-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard commands"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keydown}
      >
        <div class="c-palette-input">
          <Icon name="magnifying-glass" size="normal" />
          <input
            ref={(el) => {
              input = el;
            }}
            placeholder="Go to a page, change range, or filter…"
            aria-label="Search actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="e-actions"
            aria-activedescendant={`e-action-${index()}`}
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setIndex(0);
            }}
          />
          <button type="button" class="c-text-button" onClick={props.onClose}>
            esc
          </button>
        </div>
        <div
          ref={(el) => {
            list = el;
          }}
          id="e-actions"
          class="c-palette-list"
          role="listbox"
        >
          <For each={filtered()}>
            {(action, i) => (
              <button
                id={`e-action-${i()}`}
                type="button"
                role="option"
                aria-selected={i() === index()}
                class="c-action"
                classList={{ "c-action-selected": i() === index() }}
                onMouseMove={() => setIndex(i())}
                onClick={() => run(action)}
              >
                <span>{action.label}</span>
                <span class="c-note">{action.group}</span>
              </button>
            )}
          </For>
          <Show when={!filtered().length}>
            <div class="c-note p-4">No matching actions</div>
          </Show>
        </div>
        <div class="c-palette-foot">
          <span>↑ ↓ navigate</span>
          <span>↵ apply · esc close</span>
        </div>
      </div>
    </div>
  );
}
