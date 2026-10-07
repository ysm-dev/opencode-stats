// Exact nearest rank, shared by timing percentiles and contribution quartiles.
export const nearestRank = (sorted: readonly number[], percentile: number): number | null =>
  sorted.length === 0 ? null : sorted[Math.ceil(percentile * sorted.length) - 1]!;
