import { Icon } from "@opencode/ui/icon";
import { createMemo, For, Show } from "solid-js";
import { breakdown, dimensionValues, toolBreakdown, type Dimension } from "../../data/query";
import type { Metric } from "../../data/series";
import { compact, pct } from "../../format";
import { dash } from "../../state";
import { callsBy, formatMetric, metricValue } from "./model";

const facets: { id: Exclude<Dimension, "session" | "tool">; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "provider", label: "Provider" },
  { id: "model", label: "Model" },
  { id: "variant", label: "Variant" },
  { id: "agent", label: "Agent" },
];

export function FacetRail(props: {
  metric: Metric;
  search: string;
  setSearch: (v: string) => void;
  inputRef: (el: HTMLInputElement) => void;
}) {
  return (
    <aside class="c-facets" aria-label="Facet filters">
      <div class="c-facet-top">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium">Filters</span>
          <button class="c-text-button" type="button" onClick={() => dash.clearFilters()}>
            Clear all
          </button>
        </div>
        <div class="c-search">
          <Icon name="magnifying-glass" size="small" />
          <input
            ref={props.inputRef}
            aria-label="Search filter values"
            placeholder="Search values…"
            value={props.search}
            onInput={(e) => props.setSearch(e.currentTarget.value)}
          />
          <kbd>/</kbd>
        </div>
        <Show when={props.metric === "respMedian"}>
          <div class="c-note mt-2">p50 of timed steps · from Aug 24, 2026</div>
        </Show>
      </div>
      <div class="c-facet-scroll">
        <For each={facets}>
          {(f) => <Facet dim={f.id} label={f.label} metric={props.metric} search={props.search} />}
        </For>
        <div class="c-tool-facet">
          <div class="c-note">Applies to tool calls only</div>
          <Facet dim="tool" label="Tool" metric={props.metric} search={props.search} />
        </div>
      </div>
      <div class="c-facet-foot">
        Any-of within a dimension.
        <br />
        All-of across dimensions.
      </div>
    </aside>
  );
}

function Facet(props: { dim: Dimension; label: string; metric: Metric; search: string }) {
  const items = createMemo(() => {
    const values = dimensionValues(dash.db(), props.dim);
    const selected = dash.filters()[props.dim] ?? [];
    const q = props.search.toLowerCase();
    if (props.dim === "tool") {
      const rows = new Map(
        toolBreakdown(dash.db(), dash.filters(), dash.range()).map((r) => [r.key, r]),
      );
      return values
        .filter((v) => v.label.toLowerCase().includes(q))
        .map((v) => ({
          ...v,
          value: rows.get(v.key)?.calls ?? 0,
          selected: selected.includes(v.key),
          basis: "",
        }));
    }
    const rows = new Map(
      breakdown(dash.db(), dash.filters(), dash.range(), props.dim, dash.firsts()).map((r) => [
        r.key,
        r,
      ]),
    );
    const calls = callsBy(props.dim);
    return values
      .filter((v) => `${v.label} ${v.sub ?? ""}`.toLowerCase().includes(q))
      .map((v) => {
        const row = rows.get(v.key);
        return {
          ...v,
          value: row ? metricValue(row, props.metric, calls.get(v.key)) : emptyValue(props.metric),
          selected: selected.includes(v.key),
          basis:
            props.metric === "respMedian"
              ? `${pct((row?.respBasis ?? 0) / (row?.steps || 1), 0)} timed`
              : "",
        };
      });
  });
  const max = () => Math.max(...items().map((v) => v.value ?? 0), 1);
  const format = (v: number | null) =>
    props.dim === "tool" ? compact(v ?? 0) : formatMetric(props.metric, v);
  return (
    <details class="c-facet" open>
      <summary>
        <Icon name="chevron-down" size="small" />
        <span>{props.label}</span>
        <span class="c-facet-count num">{items().length}</span>
      </summary>
      <Show when={props.dim === "tool"}>
        <div class="c-note c-tool-count">Values show tool calls</div>
      </Show>
      <For each={items()}>
        {(v) => (
          <label
            class="c-facet-value"
            title={`${v.label}${v.sub ? ` · ${v.sub}` : ""} · ${format(v.value)}`}
          >
            <span class="c-facet-bar" style={{ width: `${((v.value ?? 0) / max()) * 100}%` }} />
            <input
              type="checkbox"
              checked={v.selected}
              onChange={() => dash.toggleFilter(props.dim, v.key)}
            />
            <span class="c-value-name">
              {v.label}
              <Show when={props.dim === "model"}>
                <span class="c-value-sub">{v.sub}</span>
              </Show>
            </span>
            <span class="num c-value-number">
              {format(v.value)}
              <Show when={v.basis}>
                <small class="c-value-sub">{v.basis}</small>
              </Show>
            </span>
          </label>
        )}
      </For>
      <Show when={!items().length}>
        <div class="c-note px-2">No matching values</div>
      </Show>
    </details>
  );
}

const emptyValue = (metric: Metric) =>
  metric === "cacheHitRate" || metric === "respMedian" ? null : 0;
