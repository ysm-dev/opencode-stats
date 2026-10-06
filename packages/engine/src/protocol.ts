import * as Schema from "effect/Schema";

const Action = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("address"), address: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("all-time") }),
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
    address: Schema.Literal("/?range=all"),
    rangeLabel: Schema.Literal("All time"),
    tokens: Tokens,
    generation: Schema.String,
    revision: Schema.Int,
    liveLabel: Schema.String,
    paused: Schema.Boolean,
    statusLine: Schema.String,
    announcement: Schema.String,
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
    state: State,
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
