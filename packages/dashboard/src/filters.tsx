import { For, Show, createMemo, createSignal, useContext } from "solid-js";
import { filterLabels } from "@opencode-stats/engine";
import { PageState, PageActions, type CompletePage } from "./page-context.ts";
import { changes, stateMark } from "./change-time.ts";

type ChecklistState = CompletePage["checklists"][number];
const rowId = (dimension: string, id: string) => `filter-${dimension}-${encodeURIComponent(id)}`;

const Checklist = (props: { dimension: ChecklistState["dimension"] }) => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  const [search, setSearch] = createSignal("");
  const [expanded, setExpanded] = createSignal(false);
  const [announcement, setAnnouncement] = createSignal("");
  const display = createMemo(() => ({ query: search(), expanded: expanded() }));
  const values = () =>
    state().checklists.find((list) => list.dimension === props.dimension)!.values;
  const matches = createMemo(() =>
    values().filter((value) =>
      `${value.name} ${value.id}`
        .toLocaleLowerCase("en-US")
        .includes(display().query.trim().toLocaleLowerCase("en-US")),
    ),
  );
  const shown = () => (display().query || display().expanded ? matches() : matches().slice(0, 5));
  const find = (id: string) => values().find((value) => value.id === id)!;
  const searchValues = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
    changes.local("search", () => {
      setSearch(event.currentTarget.value);
      const count = matches().length;
      setAnnouncement(count === 0 ? "No matches" : `${count} results`);
    });
  };
  return (
    <section
      class="filter-checklist"
      data-state={stateMark(state())}
      data-local-state={stateMark(display())}
      aria-labelledby={`filter-heading-${props.dimension}`}
    >
      <h3 id={`filter-heading-${props.dimension}`} tabIndex={-1}>
        {filterLabels[props.dimension]}
      </h3>
      <label class="sr-only" for={`filter-search-${props.dimension}`}>
        Search {filterLabels[props.dimension]}
      </label>
      <input
        type="search"
        id={`filter-search-${props.dimension}`}
        value={display().query}
        data-local-state={stateMark(display())}
        onInput={searchValues}
      />
      <span class="sr-only" aria-live="polite" aria-atomic="true">
        {announcement()}
      </span>
      <For each={shown().map((value) => value.id)}>
        {(id) => (
          <label
            class="filter-row"
            data-state={stateMark(state())}
            data-local-state={stateMark(display())}
            for={rowId(props.dimension, id)}
          >
            <input
              type="checkbox"
              tabIndex={0}
              id={rowId(props.dimension, id)}
              aria-label={find(id).name}
              aria-describedby={`${rowId(props.dimension, id)}-amount`}
              checked={find(id).selected}
              onChange={(event) => {
                const started = performance.now();
                // Native activation must not paint a tick before the worker's complete answer.
                event.currentTarget.checked = find(id).selected;
                event.currentTarget.focus();
                void client.request({ kind: "filter", dimension: props.dimension, id }, started);
              }}
            />
            <span class="filter-value">{find(id).name}</span>
            <span class="filter-amount" id={`${rowId(props.dimension, id)}-amount`}>
              {find(id).tokens.toLocaleString("en-US")}{" "}
              {props.dimension === "tool" ? "tool calls" : "tokens"}
            </span>
            <span
              class="filter-bar"
              aria-hidden="true"
              style={{ width: `${find(id).proportion * 100}%` }}
            />
          </label>
        )}
      </For>
      <Show when={!display().query && !display().expanded && values().length > 5}>
        <button
          type="button"
          tabIndex={0}
          onClick={() =>
            changes.local("expand-checklist", () => {
              const next = values()[5]!;
              // The expander disappears; put focus on the first newly revealed row.
              setExpanded(true);
              document.getElementById(rowId(props.dimension, next.id))!.focus();
            })
          }
        >
          {values().length - 5} more
        </button>
      </Show>
    </section>
  );
};

export const Filters = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  return (
    <section
      class="filters"
      data-state={stateMark(state())}
      aria-labelledby="filters-title"
      data-range={state().address}
      data-generation={state().generation}
      data-revision={state().revision}
    >
      <div class="filters-heading">
        <h2 id="filters-title" tabIndex={-1}>
          Filters
        </h2>
        <button
          type="button"
          tabIndex={0}
          onClick={(event) => {
            event.currentTarget.focus();
            void client.request({ kind: "clear-filters" });
          }}
        >
          Clear all
        </button>
      </div>
      <For each={state().checklists.map((list) => list.dimension)}>
        {(dimension) => (
          <>
            <Show when={dimension === "tool"}>
              <p class="tool-filter-divider" data-state={stateMark(state())}>
                Tool calls only
              </p>
            </Show>
            <Checklist dimension={dimension} />
          </>
        )}
      </For>
    </section>
  );
};

const chipKey = (filter: CompletePage["filters"][number]) => `${filter.dimension}\0${filter.id}`;
const chipId = (key: string) => `filter-chip-${encodeURIComponent(key)}`;

export const FilterChips = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  const find = (key: string) => state().filters.find((filter) => chipKey(filter) === key)!;
  const remove = (key: string) => {
    const started = performance.now();
    const filter = find(key);
    void client.request(
      {
        kind: "remove-filter",
        dimension: filter.dimension,
        id: filter.id,
        announce: true,
      },
      started,
    );
  };
  return (
    <section
      class="filter-chips"
      data-state={stateMark(state())}
      aria-labelledby="active-filters-title"
      data-range={state().address}
      data-generation={state().generation}
      data-revision={state().revision}
    >
      <h2 class="sr-only" id="active-filters-title" tabIndex={-1}>
        Active filters
      </h2>
      <span class="sr-only filter-announcement" aria-live="polite" aria-atomic="true">
        {state().filterAnnouncement}
      </span>
      <For each={state().filters.map(chipKey)}>
        {(key) => (
          <button
            type="button"
            tabIndex={0}
            id={chipId(key)}
            data-state={stateMark(state())}
            aria-label={`Remove ${filterLabels[find(key).dimension]} filter · ${find(key).name}`}
            onClick={(event) => {
              event.currentTarget.focus();
              remove(key);
            }}
          >
            {find(key).dimension === "tool" ? "Tool calls" : filterLabels[find(key).dimension]}:{" "}
            {find(key).name} ×
          </button>
        )}
      </For>
    </section>
  );
};
