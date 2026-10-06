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
export function mapFields<Field extends string, Value>(
  fields: readonly Field[],
  read: (field: Field) => Value,
): Record<Field, Value> {
  return Object.fromEntries(fields.map((field) => [field, read(field)])) as Record<Field, Value>;
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
