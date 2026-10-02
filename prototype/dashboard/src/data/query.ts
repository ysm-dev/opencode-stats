// PROTOTYPE: the metrics of issue #13, computed by brute force over the fake history.
import { AGENTS, modelLabel, modelProviderLabel, projectLabel, PROVIDERS } from "./catalog";
import type { Db, Dims, Prompt, Step, ToolCall } from "./db";
import { dayKey } from "./time";

export type Dimension = "project" | "provider" | "model" | "variant" | "agent" | "session" | "tool";
export type Filters = Partial<Record<Dimension, string[]>>;
export interface Span {
  start: number;
  end: number;
}

export const DIMENSIONS: { id: Dimension; label: string; plural: string }[] = [
  { id: "project", label: "Project", plural: "Projects" },
  { id: "provider", label: "Provider", plural: "Providers" },
  { id: "model", label: "Model", plural: "Models" },
  { id: "variant", label: "Variant", plural: "Variants" },
  { id: "agent", label: "Agent", plural: "Agents" },
  { id: "session", label: "Session", plural: "Sessions" },
  { id: "tool", label: "Tool", plural: "Tools" },
];

const STEP_DIMS: Exclude<Dimension, "tool">[] = [
  "project",
  "provider",
  "model",
  "variant",
  "agent",
  "session",
];

/** All-of across dimensions, any-of within one. The tool filter only reaches tool calls. */
export function matcher(f: Filters, withTool = false): (d: Dims & { tool?: string }) => boolean {
  const checks: ((d: Dims & { tool?: string }) => boolean)[] = [];
  for (const dim of STEP_DIMS) {
    const values = f[dim];
    if (values?.length) {
      const set = new Set(values);
      checks.push((d) => set.has(String(d[dim])));
    }
  }
  if (withTool && f.tool?.length) {
    const set = new Set(f.tool);
    checks.push((d) => set.has(d.tool ?? ""));
  }
  return (d) => checks.every((c) => c(d));
}

export function lowerBound(arr: { at: number }[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.at < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function within<T extends { at: number }>(arr: T[], span: Span, keep: (x: T) => boolean): T[] {
  const out: T[] = [];
  for (let i = lowerBound(arr, span.start); i < arr.length && arr[i]!.at < span.end; i++) {
    if (keep(arr[i]!)) out.push(arr[i]!);
  }
  return out;
}

export const stepsIn = (db: Db, f: Filters, span: Span): Step[] =>
  within(db.steps, span, matcher(f));
export const toolsIn = (db: Db, f: Filters, span: Span): ToolCall[] =>
  within(db.tools, span, matcher(f, true));
export const promptsIn = (db: Db, f: Filters, span: Span): Prompt[] =>
  within(db.prompts, span, matcher(f));

export interface Firsts {
  sessions: Map<number, number>; // session → its first matching step, its own or a subagent's
  subagents: Map<number, number>; // subagent session → its own first matching step
}

/** Sessions are placed at their first step matching the filters. */
export function firstSteps(db: Db, f: Filters): Firsts {
  const keep = matcher(f);
  const sessions = new Map<number, number>();
  const subagents = new Map<number, number>();
  for (const s of db.steps) {
    if (!keep(s)) continue;
    if (!sessions.has(s.session)) sessions.set(s.session, s.at);
    if (s.sub && !subagents.has(s.own)) subagents.set(s.own, s.at);
  }
  return { sessions, subagents };
}

export function countIn(firsts: Map<number, number>, span: Span): number {
  let n = 0;
  for (const t of firsts.values()) if (t >= span.start && t < span.end) n++;
  return n;
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? null;
}

export const tokensOf = (s: Step) => s.input + s.cacheRead + s.cacheWrite + s.output + s.reasoning;

export interface Totals {
  steps: number;
  tokens: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  est: number;
  pricedShare: number; // share of tokens with a list price
  rec: number;
  cacheHitRate: number | null;
  failed: number;
  interrupted: number;
  failureRate: number | null;
  errors: [string, number][];
  prompts: number;
  sessions: number;
  subagentSessions: number;
  stepsPerPrompt: number | null;
  toolCalls: number;
  succeeded: number;
  toolFailed: number;
  stopped: number;
  toolFailureRate: number | null;
  respMedian: number | null;
  respP95: number | null;
  respBasis: number; // steps with a recorded stream end
  ctxMedian: number | null;
  ctxP95: number | null;
  ctxMax: number | null;
  activeDays: number;
}

function sumSteps(steps: Step[]) {
  const t = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, est: 0, rec: 0 };
  let priced = 0;
  let failed = 0;
  let interrupted = 0;
  const errors = new Map<string, number>();
  const resp: number[] = [];
  const ctx: number[] = [];
  const days = new Set<string>();
  for (const s of steps) {
    t.input += s.input;
    t.cacheRead += s.cacheRead;
    t.cacheWrite += s.cacheWrite;
    t.output += s.output;
    t.reasoning += s.reasoning;
    t.rec += s.rec;
    if (s.est !== null) {
      t.est += s.est;
      priced += tokensOf(s);
    }
    if (s.error === "aborted") interrupted++;
    else if (s.error) {
      failed++;
      errors.set(s.error, (errors.get(s.error) ?? 0) + 1);
    }
    if (s.resp !== null) resp.push(s.resp);
    ctx.push(s.ctx);
    days.add(dayKey(s.at));
  }
  return { t, priced, failed, interrupted, errors, resp, ctx, days };
}

export function totals(db: Db, f: Filters, span: Span, firsts: Firsts): Totals {
  const steps = stepsIn(db, f, span);
  const tools = toolsIn(db, f, span);
  const prompts = promptsIn(db, f, span).length;
  const { t, priced, failed, interrupted, errors, resp, ctx, days } = sumSteps(steps);
  const tokens = t.input + t.cacheRead + t.cacheWrite + t.output + t.reasoning;
  const sent = t.input + t.cacheRead + t.cacheWrite;
  resp.sort((a, b) => a - b);
  ctx.sort((a, b) => a - b);
  let succeeded = 0;
  let toolFailed = 0;
  let stopped = 0;
  for (const c of tools) {
    if (c.outcome === "succeeded") succeeded++;
    else if (c.outcome === "failed") toolFailed++;
    else stopped++;
  }
  return {
    steps: steps.length,
    tokens,
    ...t,
    pricedShare: tokens ? priced / tokens : 1,
    cacheHitRate: sent ? t.cacheRead / sent : null,
    failed,
    interrupted,
    failureRate: steps.length ? failed / steps.length : null,
    errors: [...errors].sort((a, b) => b[1] - a[1]),
    prompts,
    sessions: countIn(firsts.sessions, span),
    subagentSessions: countIn(firsts.subagents, span),
    stepsPerPrompt: prompts ? steps.length / prompts : null,
    toolCalls: tools.length,
    succeeded,
    toolFailed,
    stopped,
    toolFailureRate: succeeded + toolFailed ? toolFailed / (succeeded + toolFailed) : null,
    respMedian: percentile(resp, 0.5),
    respP95: percentile(resp, 0.95),
    respBasis: resp.length,
    ctxMedian: percentile(ctx, 0.5),
    ctxP95: percentile(ctx, 0.95),
    ctxMax: ctx[ctx.length - 1] ?? null,
    activeDays: days.size,
  };
}

export interface Row {
  key: string;
  label: string;
  sub?: string;
  steps: number;
  tokens: number;
  est: number;
  pricedShare: number;
  rec: number;
  cacheHitRate: number | null;
  prompts: number;
  sessions: number;
  failed: number;
  failureRate: number | null;
  respMedian: number | null;
  respP95: number | null;
  respBasis: number;
  ctxMedian: number | null;
  share: number; // of tokens
  first: number;
  last: number;
  models: string[];
}

export interface ToolRow {
  key: string;
  calls: number;
  succeeded: number;
  failed: number;
  stopped: number;
  failureRate: number | null;
  runMedian: number | null;
  runP95: number | null;
  runBasis: number;
  share: number;
}

export function keyOf(dim: Exclude<Dimension, "tool">, d: Dims): string {
  return String(d[dim]);
}

export function label(db: Db, dim: Dimension, key: string): string {
  if (dim === "project") return projectLabel(key);
  if (dim === "model") return modelLabel(key);
  if (dim === "provider") return PROVIDERS[key] ?? key;
  if (dim === "session") return db.sessions.get(Number(key))?.title ?? "Untitled";
  return key;
}

export function sublabel(db: Db, dim: Dimension, key: string): string | undefined {
  if (dim === "model") return modelProviderLabel(key);
  if (dim === "session") {
    const s = db.sessions.get(Number(key));
    return s ? projectLabel(s.project) : undefined;
  }
  return undefined;
}

/** Steps, tokens and costs add up across rows; sessions and active days overlap. */
export function breakdown(
  db: Db,
  f: Filters,
  span: Span,
  dim: Exclude<Dimension, "tool">,
  firsts: Firsts,
): Row[] {
  const groups = new Map<string, Step[]>();
  for (const s of stepsIn(db, f, span)) {
    const k = keyOf(dim, s);
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }
  const promptCounts = new Map<string, number>();
  for (const p of promptsIn(db, f, span)) {
    const k = keyOf(dim, p);
    promptCounts.set(k, (promptCounts.get(k) ?? 0) + 1);
  }
  const rows: Row[] = [];
  let all = 0;
  for (const [key, steps] of groups) {
    const { t, priced, failed, resp, ctx } = sumSteps(steps);
    const tokens = t.input + t.cacheRead + t.cacheWrite + t.output + t.reasoning;
    const sent = t.input + t.cacheRead + t.cacheWrite;
    resp.sort((a, b) => a - b);
    ctx.sort((a, b) => a - b);
    all += tokens;
    const sessions = new Set<number>();
    const models = new Set<string>();
    for (const s of steps) {
      const placed = firsts.sessions.get(s.session);
      if (placed !== undefined && placed >= span.start && placed < span.end)
        sessions.add(s.session);
      models.add(s.model);
    }
    rows.push({
      key,
      label: label(db, dim, key),
      sub: sublabel(db, dim, key),
      steps: steps.length,
      tokens,
      est: t.est,
      pricedShare: tokens ? priced / tokens : 1,
      rec: t.rec,
      cacheHitRate: sent ? t.cacheRead / sent : null,
      prompts: promptCounts.get(key) ?? 0,
      sessions: sessions.size,
      failed,
      failureRate: steps.length ? failed / steps.length : null,
      respMedian: percentile(resp, 0.5),
      respP95: percentile(resp, 0.95),
      respBasis: resp.length,
      ctxMedian: percentile(ctx, 0.5),
      share: 0,
      first: steps[0]!.at,
      last: steps[steps.length - 1]!.at,
      models: [...models],
    });
  }
  for (const r of rows) r.share = all ? r.tokens / all : 0;
  return rows.sort((a, b) => b.tokens - a.tokens);
}

export function toolBreakdown(db: Db, f: Filters, span: Span): ToolRow[] {
  const groups = new Map<string, ToolCall[]>();
  for (const c of toolsIn(db, f, span)) {
    const g = groups.get(c.tool);
    if (g) g.push(c);
    else groups.set(c.tool, [c]);
  }
  let all = 0;
  const rows: ToolRow[] = [];
  for (const [key, calls] of groups) {
    let succeeded = 0;
    let failed = 0;
    let stopped = 0;
    const runs: number[] = [];
    for (const c of calls) {
      if (c.outcome === "succeeded") succeeded++;
      else if (c.outcome === "failed") failed++;
      else stopped++;
      if (c.run !== null) runs.push(c.run);
    }
    runs.sort((a, b) => a - b);
    all += calls.length;
    rows.push({
      key,
      calls: calls.length,
      succeeded,
      failed,
      stopped,
      failureRate: succeeded + failed ? failed / (succeeded + failed) : null,
      runMedian: percentile(runs, 0.5),
      runP95: percentile(runs, 0.95),
      runBasis: runs.length,
      share: 0,
    });
  }
  for (const r of rows) r.share = all ? r.calls / all : 0;
  return rows.sort((a, b) => b.calls - a.calls);
}

/** Every value a dimension has ever had, for filter pickers. */
export function dimensionValues(
  db: Db,
  dim: Dimension,
): { key: string; label: string; sub?: string }[] {
  const counts = new Map<string, number>();
  if (dim === "tool") for (const c of db.tools) counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1);
  else for (const s of db.steps) counts.set(keyOf(dim, s), (counts.get(keyOf(dim, s)) ?? 0) + 1);
  if (dim === "agent") for (const a of AGENTS) counts.set(a, counts.get(a) ?? 0);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => ({ key, label: label(db, dim, key), sub: sublabel(db, dim, key) }));
}
