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
export const stepFields = [
  "start",
  "streamEnd",
  "completed",
  "error",
  "failed",
  "interrupted",
  ...tokenKinds,
  ...stepDimensions,
] as const;
export const promptFields = [
  "start",
  "provider",
  "model",
  "variant",
  "agent",
  "project",
  "session",
] as const;
export type Prompt = Readonly<Record<(typeof promptFields)[number], number | null>> & {
  readonly start: number;
};
export type PromptColumns = Readonly<Record<(typeof promptFields)[number], Float64Array>>;
export function mapPromptFields<Value>(
  read: (field: (typeof promptFields)[number]) => Value,
): Record<(typeof promptFields)[number], Value> {
  return {
    start: read("start"),
    ...mapAttributionFields(read),
    project: read("project"),
    session: read("session"),
  };
}
function mapAttributionFields<Value>(
  read: (field: "provider" | "model" | "variant" | "agent") => Value,
) {
  return {
    provider: read("provider"),
    model: read("model"),
    variant: read("variant"),
    agent: read("agent"),
  };
}
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
    ...mapAttributionFields(read),
    project: read("project"),
    session: read("session"),
    subagent: read("subagent"),
  };
}
export function mapStepFields<Value>(
  read: (field: (typeof stepFields)[number]) => Value,
): Record<(typeof stepFields)[number], Value> {
  return {
    start: read("start"),
    streamEnd: read("streamEnd"),
    completed: read("completed"),
    error: read("error"),
    failed: read("failed"),
    interrupted: read("interrupted"),
    ...mapTokenFields(read),
    ...mapStepDimensions(read),
  };
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

export type Step = {
  readonly start: number;
  readonly streamEnd?: number | null;
  readonly completed?: number | null;
  readonly error?: number | null;
  readonly failed?: number;
  readonly interrupted?: number;
} & Readonly<Record<TokenKind, number | null>>;
export type StepColumns = { readonly start: Float64Array } & Readonly<
  Record<(typeof stepFields)[number], Float64Array>
>;

// Outcome codes: 1 succeeded, 2 failed, 3 stopped; NULL means none yet.
export const toolFields = [
  "start",
  "runStart",
  "completed",
  "outcome",
  "tool",
  ...stepDimensions,
] as const;
export type ToolCall = Readonly<Record<(typeof toolFields)[number], number | null>> & {
  readonly start: number;
  readonly tool: number;
};
export type ToolColumns = Readonly<Record<(typeof toolFields)[number], Float64Array>>;
export function mapToolFields<Value>(
  read: (field: (typeof toolFields)[number]) => Value,
): Record<(typeof toolFields)[number], Value> {
  return {
    start: read("start"),
    runStart: read("runStart"),
    completed: read("completed"),
    outcome: read("outcome"),
    tool: read("tool"),
    ...mapStepDimensions(read),
  };
}

export type BrowserCopy = {
  readonly kind: "whole" | "changes";
  readonly generation: string;
  readonly fromRevision: number;
  readonly revision: number;
  readonly historyCompleteFrom: number;
  readonly steps: StepColumns;
  readonly prompts: PromptColumns;
  readonly promptIds: readonly string[];
  readonly tools: ToolColumns;
  readonly toolIds: readonly string[];
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
