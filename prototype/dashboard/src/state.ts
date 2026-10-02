// PROTOTYPE: the dashboard state every variant shares, kept in the URL so a reload or a variant
// switch keeps the same range and filters.
import { createMemo, createRoot, createSignal } from "solid-js";
import { appendLive, type Db, generate } from "./data/db";
import { type Dimension, DIMENSIONS, type Filters, firstSteps } from "./data/query";
import type { ContributionMetric } from "./data/series";
import {
  type Bucket,
  buckets,
  drill,
  parseSpec,
  previous,
  type RangeSpec,
  resolve,
  shift,
  specKey,
} from "./data/time";

const initial = new URLSearchParams(location.search);

const started = performance.now();
const database: Db = generate(Date.now());
export const generatedIn = Math.round(performance.now() - started);

const [version, setVersion] = createSignal(0);
const [now, setNow] = createSignal(Date.now());
const [spec, setSpec] = createSignal<RangeSpec>(parseSpec(initial.get("range")));
const [filters, setFilters] = createSignal<Filters>(readFilters(initial));
const [live, setLive] = createSignal(true);
const [lastWrite, setLastWrite] = createSignal(0);

// Filters live in the URL as f.<dimension>, so the "variant" dimension can't collide with the
// prototype's ?variant= switch.
function readFilters(p: URLSearchParams): Filters {
  const f: Filters = {};
  for (const d of DIMENSIONS) {
    const v = p.get(`f.${d.id}`);
    if (v) f[d.id] = v.split(",");
  }
  return f;
}

function writeUrl(): void {
  const p = new URLSearchParams(location.search);
  p.set("range", specKey(spec()));
  for (const d of DIMENSIONS) {
    const v = filters()[d.id];
    if (v?.length) p.set(`f.${d.id}`, v.join(","));
    else p.delete(`f.${d.id}`);
  }
  history.replaceState(null, "", `?${p}`);
}

/** A URL search param as a signal, for variant-local state such as the current page. */
export function urlParam<T extends string>(name: string, fallback: T): [() => T, (v: T) => void] {
  const [get, set] = createSignal<T>(
    (new URLSearchParams(location.search).get(name) as T) ?? fallback,
  );
  return [
    get,
    (v: T) => {
      set(() => v);
      const p = new URLSearchParams(location.search);
      if (v === fallback) p.delete(name);
      else p.set(name, v);
      history.replaceState(null, "", `?${p}`);
    },
  ];
}

const derived = createRoot(() => {
  const range = createMemo(() => resolve(spec(), now(), database.first));
  return {
    range,
    buckets: createMemo(() => buckets(range(), now())),
    previous: createMemo(() => previous(range(), now(), database.first)),
    firsts: createMemo(() => {
      version();
      return firstSteps(database, filters());
    }),
  };
});

export const [contributionMetric, setContributionMetric] = urlParam<ContributionMetric>(
  "cg",
  "tokens",
);

export const dash = {
  /** The fake OpenCode database. Reading it through this accessor re-runs on live writes. */
  db: (): Db => {
    version();
    return database;
  },
  now,
  spec,
  filters,
  live,
  lastWrite,
  range: derived.range,
  buckets: derived.buckets,
  previous: derived.previous,
  firsts: derived.firsts,

  setRange(next: RangeSpec): void {
    setSpec(next);
    writeUrl();
  },
  shift(dir: -1 | 1): void {
    const next = shift(spec(), dir, now());
    if (next) dash.setRange(next);
  },
  canShift(dir: -1 | 1): boolean {
    return shift(spec(), dir, now()) !== null;
  },
  drill(b: Bucket): void {
    const next = drill(b, derived.range().bucket);
    if (next) dash.setRange(next);
  },
  toggleFilter(dim: Dimension, key: string): void {
    const cur = filters()[dim] ?? [];
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    setFilters({ ...filters(), [dim]: next });
    writeUrl();
  },
  setFilter(dim: Dimension, keys: string[]): void {
    setFilters({ ...filters(), [dim]: keys });
    writeUrl();
  },
  clearFilters(dim?: Dimension): void {
    setFilters(dim ? { ...filters(), [dim]: [] } : {});
    writeUrl();
  },
  activeFilters(): [Dimension, string[]][] {
    return DIMENSIONS.flatMap((d) => {
      const v = filters()[d.id];
      return v?.length ? [[d.id, v] as [Dimension, string[]]] : [];
    });
  },
  setLive,
};

setInterval(() => setNow(Date.now()), 30000);
setInterval(() => {
  if (!live()) return;
  appendLive(database, Date.now());
  setNow(Date.now());
  setLastWrite(Date.now());
  setVersion((v) => v + 1);
}, 8000);
