import { Icon } from "@opencode/ui/icon";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { dimensionValues, DIMENSIONS } from "../../data/query";
import { PRESETS } from "../../data/time";
import type { Metric } from "../../data/series";
import { dash } from "../../state";
import { dimensions, metrics, type Cut } from "./model";

interface Action {
  label: string;
  run: () => void;
  group: string;
}

export function Palette(props: {
  metric: Metric;
  setMetric: (m: Metric) => void;
  setCut: (c: Cut) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  let input!: HTMLInputElement;
  let list!: HTMLDivElement;
  const actions = createMemo<Action[]>(() => [
    ...metrics.map((m) => ({
      label: `Metric: ${m.label}`,
      group: "Metric",
      run: () => props.setMetric(m.id),
    })),
    ...dimensions
      .filter((d) => d.id !== "kind" || props.metric === "tokens")
      .map((d) => ({ label: `By: ${d.label}`, group: "Dimension", run: () => props.setCut(d.id) })),
    ...PRESETS.map((p) => ({
      label: `Range: ${p.long}`,
      group: "Range",
      run: () => dash.setRange({ kind: "preset", preset: p.id }),
    })),
    { label: "Clear filters", group: "Filters", run: () => dash.clearFilters() },
    ...DIMENSIONS.flatMap((d) =>
      dimensionValues(dash.db(), d.id)
        .slice(0, 40)
        .map((v) => ({
          label: `Filter ${d.id}: ${v.label}${v.sub ? ` · ${v.sub}` : ""}${d.id === "tool" ? " · tool calls only" : ""}`,
          group: "Filter",
          run: () => dash.toggleFilter(d.id, v.key),
        })),
    ),
  ]);
  const filtered = createMemo(() =>
    actions()
      .filter((a) => a.label.toLowerCase().includes(query().toLowerCase()))
      .slice(0, 60),
  );
  onMount(() => input.focus());
  function run(action: Action | undefined) {
    if (!action) return;
    action.run();
    props.onClose();
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
        aria-label="Explorer command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keydown}
      >
        <div class="c-palette-input">
          <Icon name="magnifying-glass" size="normal" />
          <input
            ref={(el) => {
              input = el;
            }}
            placeholder="Change metric, dimension, range or filter…"
            aria-label="Search actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="c-actions"
            aria-activedescendant={`c-action-${index()}`}
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
          id="c-actions"
          class="c-palette-list"
          role="listbox"
        >
          <For each={filtered()}>
            {(action, i) => (
              <button
                id={`c-action-${i()}`}
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
