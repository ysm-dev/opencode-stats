export const tokenKinds = ["input", "cacheRead", "cacheWrite", "output", "reasoning"] as const;
export type TokenKind = (typeof tokenKinds)[number];

export type Step = { readonly start: number } & Readonly<Record<TokenKind, number | null>>;
export type StepColumns = { readonly start: Float64Array } & Readonly<
  Record<TokenKind, Float64Array>
>;

export type BrowserCopy = {
  readonly kind: "whole" | "changes";
  readonly generation: string;
  readonly fromRevision: number;
  readonly revision: number;
  readonly historyCompleteFrom: number;
  readonly steps: StepColumns;
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
