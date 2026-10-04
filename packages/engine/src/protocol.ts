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
  }),
  Schema.Struct({
    screen: Schema.Literal("problem"),
    reason: Schema.Literals(["copy-unavailable", "invalid-address"]),
  }),
]);
export type EngineState = typeof State.Type;
export const Request = Schema.Struct({ id: Schema.Int, action: Action });
export const Answer = Schema.Struct({ id: Schema.Int, state: State });
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
