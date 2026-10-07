import type { DimensionName, Step, ToolCall } from "../facts.ts";

// Generate genuine synthetic source metadata alongside the generated facts.
// Production never invents names for a dangling reference.
export function syntheticNames(
  steps: readonly Step[],
  tools: readonly Pick<ToolCall, "tool">[] = [],
): DimensionName[] {
  const references = [
    ...steps.flatMap((step) =>
      step.error === undefined || step.error === null
        ? []
        : [{ dimension: "error", code: step.error }],
    ),
    ...tools.map((call) => ({ dimension: "tool", code: call.tool })),
  ];
  return [
    ...new Map(
      references.map(({ dimension, code }) => [
        `${dimension}\0${code}`,
        {
          dimension,
          code,
          id: `synthetic-${dimension}-${code}`,
          name: `Synthetic ${dimension} ${code}`,
        },
      ]),
    ).values(),
  ];
}
