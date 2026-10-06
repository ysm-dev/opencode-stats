export const tokenKinds = ["input", "cacheRead", "cacheWrite", "output", "reasoning"] as const;
export type TokenKind = (typeof tokenKinds)[number];
export const stepDimensions = [
  "provider",
  "model",
  "variant",
  "agent",
  "project",
  "session",
  "subagent",
] as const;
export type StepDimension = (typeof stepDimensions)[number];
export const stepFields = ["start", ...tokenKinds, ...stepDimensions] as const;
export const sessionFields = ["code", "parent", "session", "project", "fork"] as const;
export function mapTokenFields<Value>(read: (field: TokenKind) => Value): Record<TokenKind, Value> {
  return {
    input: read("input"),
    cacheRead: read("cacheRead"),
    cacheWrite: read("cacheWrite"),
    output: read("output"),
    reasoning: read("reasoning"),
  };
}
export function mapStepDimensions<Value>(
  read: (field: StepDimension) => Value,
): Record<StepDimension, Value> {
  return {
    provider: read("provider"),
    model: read("model"),
    variant: read("variant"),
    agent: read("agent"),
    project: read("project"),
    session: read("session"),
    subagent: read("subagent"),
  };
}
export function mapStepFields<Value>(
  read: (field: (typeof stepFields)[number]) => Value,
): Record<(typeof stepFields)[number], Value> {
  return { start: read("start"), ...mapTokenFields(read), ...mapStepDimensions(read) };
}
export function mapSessionFields<Value>(
  read: (field: (typeof sessionFields)[number]) => Value,
): Record<(typeof sessionFields)[number], Value> {
  return {
    code: read("code"),
    parent: read("parent"),
    session: read("session"),
    project: read("project"),
    fork: read("fork"),
  };
}
export type SessionFact = Readonly<Record<(typeof sessionFields)[number], number | null>> & {
  readonly code: number;
  readonly session: number;
  readonly project: number;
};
export type SessionColumns = Readonly<Record<(typeof sessionFields)[number], Float64Array>>;
export type StepDimensions = Readonly<Record<StepDimension, number | null>>;

export type Step = { readonly start: number } & Readonly<Record<TokenKind, number | null>>;
export type StepColumns = { readonly start: Float64Array } & Readonly<
  Record<TokenKind | StepDimension, Float64Array>
>;

export type BrowserCopy = {
  readonly kind: "whole" | "changes";
  readonly generation: string;
  readonly fromRevision: number;
  readonly revision: number;
  readonly historyCompleteFrom: number;
  readonly steps: StepColumns;
  readonly sessions: SessionColumns;
  readonly projects: Float64Array;
  readonly sessionTombstones: Float64Array;
  readonly projectTombstones: Float64Array;
  readonly ids: readonly string[];
  readonly tombstones: readonly string[];
  readonly names: readonly DimensionName[];
};

export type DimensionName = {
  readonly dimension: string;
  readonly code: number;
  readonly id: string;
  readonly name: string;
};
