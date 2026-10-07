// Registration axes; e2e-plan's control verifies every viewport file uses these cases.
export const tourWidths = [360, 1280] as const;
export const tourRounds = [0, 1] as const;
export const tourStages = ["data", "appearance", "live"] as const;
export const tourCases = tourRounds.flatMap((round) =>
  tourStages.map((stage, index) => ({ round, stage, index: round * tourStages.length + index })),
);
