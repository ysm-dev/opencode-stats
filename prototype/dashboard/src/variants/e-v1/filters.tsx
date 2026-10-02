import { Icon } from "@opencode/ui/icon";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  breakdown,
  dimensionValues,
  DIMENSIONS,
  label,
  toolBreakdown,
  type Dimension,
} from "../../data/query";
import { compact } from "../../format";
import { dash } from "../../state";

export function Filters(props: { inputRef: (el: HTMLInputElement) => void }) {
  const [search, setSearch] = createSignal("");
  return (
    <section class="e-filters" aria-label="Filters">
      <div class="c-facet-top">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium">Filters</span>
          <button type="button" class="c-text-button" onClick={() => dash.clearFilters()}>
            Clear all
          </button>
        </div>
        <div class="c-search">
          <Icon name="magnifying-glass" size="small" />
          <input
            ref={props.inputRef}
            aria-label="Search filter values"
            placeholder="Search values…"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <kbd>/</kbd>
        </div>
        <div class="c-note mt-2">Values show tokens in this range</div>
      </div>
      <div class="e-facet-list">
        <For each={DIMENSIONS.filter((d) => d.id !== "session" && d.id !== "tool")}>
          {(d) => <Facet dim={d.id} title={d.label} search={search()} />}
        </For>
        <div class="c-tool-facet">
          <div class="c-note">Tool calls only</div>
          <Facet dim="tool" title="Tool" search={search()} />
        </div>
      </div>
      <div class="e-filter-note">Any-of within a dimension · all-of across</div>
    </section>
  );
}

function Facet(props: { dim: Dimension; title: string; search: string }) {
  const [all, setAll] = createSignal(false);
  const items = createMemo(() => {
    const amounts =
      props.dim === "tool"
        ? new Map(
            toolBreakdown(dash.db(), dash.filters(), dash.range()).map((r) => [r.key, r.calls]),
          )
        : new Map(
            breakdown(dash.db(), dash.filters(), dash.range(), props.dim, dash.firsts()).map(
              (r) => [r.key, r.tokens],
            ),
          );
    return dimensionValues(dash.db(), props.dim)
      .filter((v) => `${v.label} ${v.sub ?? ""}`.toLowerCase().includes(props.search.toLowerCase()))
      .map((v) => ({
        ...v,
        value: amounts.get(v.key) ?? 0,
        selected: !!dash.filters()[props.dim]?.includes(v.key),
      }))
      .sort((a, b) => Number(b.selected) - Number(a.selected) || b.value - a.value);
  });
  const max = () => Math.max(...items().map((v) => v.value), 1);
  const visible = () => (all() || props.search ? items() : items().slice(0, 5));
  return (
    <details class="c-facet" open>
      <summary>
        <Icon name="chevron-down" size="small" />
        <span>{props.title}</span>
        <span class="c-facet-count num">{items().length}</span>
      </summary>
      <For each={visible()}>
        {(v) => (
          <label
            class="c-facet-value"
            title={`${v.label}${v.sub ? ` · ${v.sub}` : ""} · ${compact(v.value)} ${props.dim === "tool" ? "tool calls" : "tokens"}`}
          >
            <span class="c-facet-bar" style={{ width: `${(v.value / max()) * 100}%` }} />
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
            <span class="num c-value-number">{compact(v.value)}</span>
          </label>
        )}
      </For>
      <Show when={items().length > 5 && !props.search}>
        <button type="button" class="e-more" onClick={() => setAll((v) => !v)}>
          {all() ? "Show less" : `${items().length - 5} more`}
        </button>
      </Show>
      <Show when={!items().length}>
        <div class="c-note px-2">No matching values</div>
      </Show>
    </details>
  );
}

export function FilterChips() {
  return (
    <Show when={dash.activeFilters().length}>
      <div class="e-chips" aria-label="Active filters">
        <For each={dash.activeFilters()}>
          {([dim, keys]) => (
            <span class="e-chip">
              <span class="muted">
                {dim === "tool" ? "Tool calls:" : `${DIMENSIONS.find((d) => d.id === dim)!.label}:`}
              </span>
              <span class="e-chip-value">
                {keys.map((k) => label(dash.db(), dim, k)).join(", ")}
              </span>
              <button
                type="button"
                aria-label={`Remove ${dim} filter`}
                onClick={() => dash.clearFilters(dim)}
              >
                <Icon name="xmark-small" size="small" />
              </button>
            </span>
          )}
        </For>
        <button type="button" class="c-text-button" onClick={() => dash.clearFilters()}>
          Clear all
        </button>
      </div>
    </Show>
  );
}
