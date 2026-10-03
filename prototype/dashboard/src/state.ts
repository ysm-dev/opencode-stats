// PROTOTYPE: the dashboard state every variant shares, kept in the URL so a reload or a variant
// switch keeps the same range and filters.
import { createMemo, createRoot, createSignal } from "solid-js";
import { appendLive, type Db, generate } from "./data/db";
import { type Dimension, DIMENSIONS, type Filters, firstSteps } from "./data/query";
import type { ContributionMetric } from "./data/series";
import {
  addDays,
  type Bucket,
  buckets,
  drill,
  parseSpec,
  previous,
  type RangeSpec,
  resolve,
  shift,
  specKey,
  startOfDay,
} from "./data/time";

const initial = new URLSearchParams(location.search);

/** Inside a width frame of the prototype bar: the bar lives in the parent page. */
export const embedded = initial.has("embed");

/** URL params that belong to the prototype chrome rather than to the dashboard. */
export const PROTO_PARAMS = new Set([
  "variant",
  "frame",
  "embed",
  "touch",
  "build",
  "dates",
  "clock",
  "live",
]);
export const isProtoParam = (name: string) => PROTO_PARAMS.has(name) || name.startsWith("m.");

const setters = new Map<string, (v: string) => void>();
let broadcaster: ((name: string, value: string) => void) | null = null;
let applying = false;

/** The framing page registers how to pass prototype settings on to its frames. */
export function setBroadcaster(fn: (name: string, value: string) => void): void {
  broadcaster = fn;
}

/** A framed copy reports its address to the bar's page, which mirrors it to the other frames. */
function notifyParent(): void {
  if (embedded && !applying)
    parent.postMessage({ type: "proto:url", search: location.search }, "*");
}

/** Apply a setting or another frame's address without echoing it back. */
export function applyQuietly(fn: () => void): void {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

export function setParam(name: string, value: string): boolean {
  const set = setters.get(name);
  set?.(value);
  return !!set;
}

/** A prototype setting that isn't a URL param, such as the colour scheme. */
export function registerSetter(name: string, set: (v: string) => void): void {
  setters.set(name, set);
}

export function broadcast(name: string, value: string): void {
  broadcaster?.(name, value);
}

const started = performance.now();
const database: Db = generate(Date.now());
export const generatedIn = Math.round(performance.now() - started);

const [version, setVersion] = createSignal(0);
const [now, setNow] = createSignal(Date.now());
const [spec, setSpec] = createSignal<RangeSpec>(parseSpec(initial.get("range")));
const [filters, setFilters] = createSignal<Filters>(readFilters(initial));
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
  notifyParent();
}

/** A URL search param as a signal, for variant-local state such as the current page. */
export function urlParam<T extends string>(name: string, fallback: T): [() => T, (v: T) => void] {
  const [get, set] = createSignal<T>(
    (new URLSearchParams(location.search).get(name) as T) ?? fallback,
  );
  const write = (v: T) => {
    set(() => v);
    const p = new URLSearchParams(location.search);
    if (v === fallback || v === "") p.delete(name);
    else p.set(name, v);
    history.replaceState(null, "", `?${p}`);
    if (isProtoParam(name)) broadcaster?.(name, v);
    else notifyParent();
  };
  setters.set(name, (v) => write((v || fallback) as T));
  return [get, write];
}

/** Prototype-only: force the touch presentation on a mouse-driven screen. */
export const [touch, setTouch] = urlParam<"auto" | "on">("touch", "auto");
/**
 * Prototype-only: the status line's states from "How does opencode-stats report problems?":
 * a build reading older history, a build stopped partway, sync stopped, a lost dashboard server.
 */
export type BuildState = "off" | "on" | "stopped" | "stale" | "lost";
export const [build, setBuild] = urlParam<BuildState>("build", "off");
export const notUpdating = () => build() === "stopped" || build() === "stale" || build() === "lost";
const [liveParam, setLiveParam] = urlParam<"on" | "off">("live", "on");

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
    // A build that hasn't reached the first activity counts from the earliest local day it has
    // read completely. The prototype only shows where that is said; it doesn't clip the counts.
    historyFrom: createMemo(() =>
      build() === "on" || build() === "stopped" ? startOfDay(addDays(startOfDay(now()), -7)) : null,
    ),
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
  live: () => liveParam() === "on",
  lastWrite,
  range: derived.range,
  buckets: derived.buckets,
  previous: derived.previous,
  firsts: derived.firsts,
  historyFrom: derived.historyFrom,

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
  setLive: (on: boolean) => setLiveParam(on ? "on" : "off"),
  /** Mirror another frame's address: range, filters and the variant-local params. */
  applySearch(search: string): void {
    const p = new URLSearchParams(search);
    applyQuietly(() => {
      setSpec(parseSpec(p.get("range")));
      setFilters(readFilters(p));
      writeUrl();
      for (const [name, set] of setters) if (!isProtoParam(name)) set(p.get(name) ?? "");
    });
  },
};

setInterval(() => setNow(Date.now()), 30000);
setInterval(() => {
  if (!dash.live()) return;
  appendLive(database, Date.now());
  setNow(Date.now());
  setLastWrite(Date.now());
  setVersion((v) => v + 1);
}, 8000);
