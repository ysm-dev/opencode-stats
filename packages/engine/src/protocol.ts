import * as Schema from "effect/Schema";
import { Preset } from "./ranges.ts";
import { Filter, FilterDimension } from "./filters.ts";
import { ComputeTime } from "./change.ts";
import { StepMetrics } from "./step-metrics.ts";
import { ToolMetrics } from "./tool-metrics.ts";

const Action = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("address"), address: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("all-time") }),
  Schema.Struct({ kind: Schema.Literals(["preset", "remove-fixed"]), preset: Preset }),
  Schema.Struct({ kind: Schema.Literal("shift"), direction: Schema.Literals([-1, 1]) }),
  Schema.Struct({
    kind: Schema.Literals(["filter", "remove-filter"]),
    dimension: FilterDimension,
    id: Schema.String,
    announce: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({ kind: Schema.Literal("clear-filters") }),
]);
export type EngineAction = typeof Action.Type;
const Tokens = Schema.Struct({
  total: Schema.Number,
  input: Schema.Number,
  cacheRead: Schema.Number,
  cacheWrite: Schema.Number,
  output: Schema.Number,
  reasoning: Schema.Number,
});
const State = Schema.Union([
  Schema.Struct({
    screen: Schema.Literal("dashboard"),
    address: Schema.String,
    rangeLabel: Schema.String,
    range: Schema.Struct({
      preset: Preset,
      fixedLabel: Schema.String,
      canShiftBack: Schema.Boolean,
      canShiftForward: Schema.Boolean,
    }),
    period: Schema.Struct({
      start: Schema.Number,
      end: Schema.Number,
      from: Schema.String,
      to: Schema.String,
      days: Schema.Number,
    }),
    timeZone: Schema.String,
    historyStart: Schema.Number,
    historyComplete: Schema.Boolean,
    summary: Schema.String,
    comparison: Schema.Struct({
      tokens: Schema.String,
      sessions: Schema.String,
      steps: Schema.String,
      prompts: Schema.String,
      failed: Schema.String,
      response: Schema.String,
      cacheHitRate: Schema.String,
      tools: Schema.String,
      cost: Schema.String,
      caption: Schema.String,
    }),
    tokens: Tokens,
    metrics: StepMetrics,
    tools: ToolMetrics,
    recordedFromLabel: Schema.String,
    filters: Schema.Array(Schema.Struct({ ...Filter.fields, name: Schema.String })),
    checklists: Schema.Array(
      Schema.Struct({
        dimension: FilterDimension,
        values: Schema.Array(
          Schema.Struct({
            id: Schema.String,
            name: Schema.String,
            tokens: Schema.Number,
            selected: Schema.Boolean,
            proportion: Schema.Number,
          }),
        ),
      }),
    ),
    sessions: Schema.Struct({ total: Schema.Number, subagents: Schema.Number }),
    generation: Schema.String,
    revision: Schema.Int,
    liveLabel: Schema.String,
    paused: Schema.Boolean,
    statusLine: Schema.String,
    announcement: Schema.String,
    filterAnnouncement: Schema.String,
  }),
  Schema.Struct({
    screen: Schema.Literal("problem"),
    reason: Schema.Literals(["copy-unavailable", "invalid-address"]),
  }),
]);
export type EngineState = typeof State.Type;
const Request = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  action: Action,
});
const Signal = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("visibility"), visible: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("paused"), paused: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("focus") }),
]);
export type EngineSignal = typeof Signal.Type;
export const Message = Schema.Union([Request, Signal]);
export const Answer = Schema.Union([
  Schema.Struct({ reload: Schema.Literal(true) }),
  Schema.Struct({
    id: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    state: State,
    timing: ComputeTime,
    posted: Schema.Uint8Array,
  }),
]);
export type EngineRequest = typeof Request.Type;
export type RequestOutcome =
  | { readonly kind: "paint"; readonly state: EngineState }
  | { readonly kind: "replaced" | "closed" };

// Workers and their global scopes both implement this surface. It deliberately
// uses only worker-library types, so the page's DOM library need not reach here.
export type ChannelPort = {
  postMessage(message: object): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};
