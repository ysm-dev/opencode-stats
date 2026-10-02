// PROTOTYPE: a deterministic, invented usage history shaped like the facts in issue #13.
import { MODEL_BY_ID, sessionTitle, STEP_ERRORS, TOOLS } from "./catalog";

export interface Dims {
  session: number; // the session a step belongs to (subagent steps roll up)
  own: number; // the conversation the step ran in
  sub: boolean; // ran in a subagent session
  project: string;
  provider: string;
  model: string;
  variant: string;
  agent: string;
}

export interface Step extends Dims {
  id: number;
  at: number; // request sent
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  est: number | null; // null: model has no list price
  rec: number;
  resp: number | null; // null: stream end not recorded (before late August)
  ctx: number;
  error: string | null; // "aborted" is an interruption, anything else a failure
}

export type Outcome = "succeeded" | "failed" | "stopped";

export interface ToolCall extends Dims {
  at: number;
  step: number;
  tool: string;
  outcome: Outcome;
  run: number | null; // null: run start not recorded
}

export interface Prompt extends Dims {
  at: number;
}

export interface Session {
  id: number;
  title: string;
  project: string;
  parent: number | null; // the session a subagent session belongs to
  agent: string;
}

export interface Db {
  steps: Step[];
  tools: ToolCall[];
  prompts: Prompt[];
  sessions: Map<number, Session>;
  first: number;
}

/** Stream end and tool run start only exist from late August 2026, as in the real database. */
export const RECORDED_FROM = new Date(2026, 7, 24).getTime();
const RECORDED_FULLY = new Date(2026, 9, 1).getTime();

/** Coverage ramps up like a rolling OpenCode upgrade: about 70% of September, nearly all of October. */
function recorded(at: number): boolean {
  if (at < RECORDED_FROM) return false;
  const ramp = Math.min(1, (at - RECORDED_FROM) / (RECORDED_FULLY - RECORDED_FROM));
  return rand() < 0.45 + 0.55 * ramp;
}
const HISTORY_FROM = new Date(2026, 0, 12);
const OFF_DAYS: [number, number, number, number][] = [
  [4, 18, 4, 24],
  [7, 10, 7, 14],
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260102);
const pick = (n: number) => Math.floor(rand() * n);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1]![0];
}

/** Model mix drifts over the year: Opus early, Sonnet mid-year, GPT-6.1 Sol from September. */
function modelFor(progress: number): string {
  return weighted<string>([
    ["anthropic/claude-opus-5", progress < 0.3 ? 40 : 8],
    ["anthropic/claude-sonnet-5", progress < 0.3 ? 30 : progress < 0.75 ? 50 : 22],
    ["openai/gpt-5.6-luna", progress > 0.3 && progress < 0.8 ? 16 : 3],
    ["openai/gpt-6.1-sol", progress > 0.85 ? 42 : 0],
    ["opencode-go/gpt-5.6-luna", progress > 0.6 ? 12 : 0],
    ["google/gemini-3-pro", 4],
    ["opencode/kimi-k3-free", 3],
    ["ollama/qwen3-coder", 1.6],
  ]);
}

function subagentModel(main: string): string {
  if (main.startsWith("anthropic/")) return rand() < 0.6 ? "anthropic/claude-haiku-5" : main;
  if (main.startsWith("openai/")) return rand() < 0.5 ? "openai/gpt-5.6-luna" : main;
  return main;
}

function variantFor(model: string): string {
  if (model.startsWith("openai/") || model.startsWith("opencode-go/")) {
    return weighted<string>([
      ["high", 50],
      ["default", 30],
      ["max", 10],
      ["low", 10],
    ]);
  }
  if (model.startsWith("anthropic/")) {
    return weighted<string>([
      ["default", 60],
      ["high", 30],
      ["max", 10],
    ]);
  }
  return "default";
}

function projectFor(progress: number): string {
  const live = (from: number, to: number, w: number) =>
    progress >= from && progress <= to ? w : 0;
  return weighted<string>([
    ["p-storefront", 30],
    ["p-billing", live(0, 0.7, 22)],
    ["p-api-work", live(0.25, 1, 18)],
    ["p-api-side", 5],
    ["p-mobile", live(0.55, 1, 20)],
    ["p-infra", 7],
    ["p-ml", live(0.4, 0.85, 12)],
    ["p-docs", 5],
    ["p-dotfiles", 3],
    ["global", 4],
  ]);
}

function startHour(): number {
  const [mean, sd] = weighted<[number, number]>([
    [[10, 1.6], 45],
    [[15, 1.8], 40],
    [[21.5, 1.2], 15],
  ]);
  return mean + (rand() + rand() + rand() - 1.5) * sd;
}

function isOffDay(d: Date): boolean {
  return OFF_DAYS.some(
    ([m1, d1, m2, d2]) =>
      d >= new Date(d.getFullYear(), m1, d1) && d <= new Date(d.getFullYear(), m2, d2),
  );
}

let nextSession = 1;
let nextStep = 1;

interface Ctx {
  db: Db;
  now: number;
}

function price(model: string, s: Omit<Step, "est" | "rec">): { est: number | null; rec: number } {
  const info = MODEL_BY_ID.get(model);
  if (!info?.price) return { est: null, rec: 0 };
  const p = info.price;
  const est =
    (s.input * p.input +
      s.cacheRead * p.cacheRead +
      s.cacheWrite * p.cacheWrite +
      (s.output + s.reasoning) * p.output) /
    1e6;
  return { est, rec: info.billedPerToken ? est : 0 };
}

function makeStep(dims: Dims, at: number, ctx: number, first: boolean): Step {
  const roll = rand();
  const error =
    roll < 0.004 ? STEP_ERRORS[pick(STEP_ERRORS.length)]! : roll < 0.009 ? "aborted" : null;
  const reasoningOn = MODEL_BY_ID.get(dims.model)?.reasoning && dims.variant !== "default";
  const input = Math.round(between(200, 3800));
  const cacheRead = first ? 0 : Math.round(ctx * between(0.88, 0.975));
  const cacheWrite = Math.max(0, ctx - cacheRead - input);
  const output = error ? Math.round(between(0, 200)) : Math.round(between(120, 2600));
  const reasoning = reasoningOn ? Math.round(between(60, dims.variant === "max" ? 4200 : 1500)) : 0;
  const base = { ...dims, id: nextStep++, at, input, cacheRead, cacheWrite, output, reasoning };
  const duration = Math.round(1200 + (output + reasoning) * between(8, 18));
  const resp = recorded(at) ? duration : null;
  return { ...base, ...price(dims.model, { ...base, resp, ctx, error }), resp, ctx, error };
}

function addToolCalls(c: Ctx, step: Step, subagent: boolean): number {
  const count = step.error
    ? 0
    : weighted<number>([
        [0, 22],
        [1, 38],
        [2, 22],
        [3, 12],
        [4, 6],
      ]);
  let spent = 0;
  for (let i = 0; i < count; i++) {
    const [tool, , typical, failOdds] = weighted<[string, number, number, number]>(
      TOOLS.filter(([t]) => !subagent || t !== "subagent").map((t) => [t, t[1]]),
    );
    const roll = rand();
    const outcome = roll < failOdds ? "failed" : roll < failOdds + 0.012 ? "stopped" : "succeeded";
    const run = Math.round(typical * Math.exp((rand() + rand() + rand() - 1.5) * 1.2));
    spent += run;
    c.db.tools.push({
      ...pickDims(step),
      at: step.at,
      step: step.id,
      tool,
      outcome,
      run: recorded(step.at) ? run : null,
    });
    if (tool === "subagent" && !subagent) spent += runSubagent(c, step, step.at + 500);
  }
  return spent;
}

function pickDims(s: Dims): Dims {
  const { session, own, sub, project, provider, model, variant, agent } = s;
  return { session, own, sub, project, provider, model, variant, agent };
}

function runSubagent(c: Ctx, parent: Step, at: number): number {
  const own = nextSession++;
  const model = subagentModel(parent.model);
  const agent = rand() < 0.7 ? "explore" : "general";
  c.db.sessions.set(own, {
    id: own,
    title: `${agent === "explore" ? "Explore" : "Research"}: ${sessionTitle(pick).toLowerCase()}`,
    project: parent.project,
    parent: parent.session,
    agent,
  });
  const dims: Dims = {
    ...pickDims(parent),
    own,
    sub: true,
    model,
    provider: model.split("/")[0]!,
    variant: variantFor(model),
    agent,
  };
  let t = at;
  let ctx = between(9000, 16000);
  const steps = 3 + pick(11);
  for (let i = 0; i < steps && t < c.now; i++) {
    const step = makeStep(dims, t, Math.round(ctx), i === 0);
    c.db.steps.push(step);
    t += (step.resp ?? between(4000, 20000)) + addToolCalls(c, step, true);
    ctx += between(1500, 6000);
  }
  return t - at;
}

function runSession(c: Ctx, at: number, progress: number): void {
  const id = nextSession++;
  const project = projectFor(progress);
  const agent = weighted<string>([
    ["build", 72],
    ["plan", 20],
    ["review", 8],
  ]);
  c.db.sessions.set(id, { id, title: sessionTitle(pick), project, parent: null, agent });
  let model = modelFor(progress);
  let t = at;
  let ctx = between(11000, 18000);
  let first = true;
  const prompts = 1 + Math.floor(-Math.log(1 - rand()) * 2.6);
  for (let p = 0; p < prompts && t < c.now; p++) {
    if (rand() < 0.12) model = modelFor(progress);
    const variant = variantFor(model);
    const dims: Dims = {
      session: id,
      own: id,
      sub: false,
      project,
      provider: model.split("/")[0]!,
      model,
      variant,
      agent,
    };
    c.db.prompts.push({ ...dims, at: t });
    const steps = 2 + Math.floor(-Math.log(1 - rand()) * 5);
    for (let s = 0; s < steps && t < c.now; s++) {
      const step = makeStep(dims, t, Math.round(ctx), first);
      first = false;
      c.db.steps.push(step);
      t += (step.resp ?? between(5000, 30000)) + addToolCalls(c, step, false);
      ctx = ctx > 380000 ? between(30000, 50000) : ctx + between(2000, 9000);
      if (step.error === "aborted") break;
    }
    t += between(60000, 900000);
  }
}

export function generate(now: number): Db {
  const db: Db = { steps: [], tools: [], prompts: [], sessions: new Map(), first: 0 };
  const c: Ctx = { db, now };
  const start = HISTORY_FROM;
  const totalDays = Math.round((now - start.getTime()) / 86400000);
  for (let i = 0; i <= totalDays; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (day.getTime() > now || isOffDay(day)) continue;
    const progress = i / totalDays;
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    if (rand() < (weekend ? 0.5 : 0.05)) continue;
    const sessions = Math.round((0.6 + progress * 0.9) * (weekend ? 1.4 : 4.2) * between(0.5, 1.5));
    for (let s = 0; s < sessions; s++) {
      const at = day.getTime() + Math.max(0, Math.min(23.8, startHour())) * 3600000;
      if (at < now) runSession(c, at, progress);
    }
  }
  db.steps.sort((a, b) => a.at - b.at);
  db.tools.sort((a, b) => a.at - b.at);
  db.prompts.sort((a, b) => a.at - b.at);
  db.first = db.steps[0]?.at ?? now;
  return db;
}

/** Simulates OpenCode writing a new step to the latest session, for "no page refresh" updates. */
export function appendLive(db: Db, now: number): void {
  const last = [...db.steps].reverse().find((s) => !s.sub);
  if (!last) return;
  const fresh = now - last.at > 30 * 60000;
  const session = fresh ? nextSession++ : last.session;
  if (fresh) {
    db.sessions.set(session, {
      id: session,
      title: sessionTitle(pick),
      project: last.project,
      parent: null,
      agent: "build",
    });
    db.prompts.push({ ...pickDims(last), session, own: session, at: now });
  }
  const step = makeStep({ ...pickDims(last), session, own: session }, now, last.ctx + 3000, fresh);
  db.steps.push(step);
  addToolCalls({ db, now: now + 1 }, step, false);
}
