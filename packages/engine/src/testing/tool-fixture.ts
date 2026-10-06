import { mapToolFields, mapStepDimensions, type ToolCall } from "@opencode-stats/browser-copy";
import { metricCopy, metricSteps } from "./metrics-fixture.ts";

export const toolNames = [
  "read",
  "shell",
  "execute",
  "server.lookup",
  "plugin.custom",
  "todowrite",
].map((name, i) => ({ dimension: "tool", code: 600 + i, id: name, name }));
const call = (tool: number, outcome: number | null, runTime: number | null): ToolCall => ({
  ...mapStepDimensions((field) => metricSteps[2]![field]),
  start: metricSteps[2]!.start,
  tool,
  outcome,
  runStart: runTime === null ? null : metricSteps[2]!.start + 100,
  completed: runTime === null ? null : metricSteps[2]!.start + 100 + runTime,
});
export const toolCalls: readonly ToolCall[] = [
  { ...call(600, 1, 123), start: metricSteps[1]!.start },
  ...[0, 10, 20, 1000].map((duration) => call(600, 1, duration)),
  { ...call(600, 2, null), completed: metricSteps[2]!.start + 200 },
  call(601, 3, 100),
  { ...call(602, null, null), runStart: metricSteps[2]!.start + 100 },
  call(601, 1, null),
  call(603, 2, 200),
  call(604, 3, null),
  call(605, 1, 0),
];
export const toolCopy = (calls = toolCalls) => {
  const copy = metricCopy();
  return {
    ...copy,
    names: [...copy.names, ...toolNames],
    toolIds: calls.map((_, i) => `tool:${i}`),
    tools: mapToolFields((field) => Float64Array.from(calls, (item) => item[field] ?? NaN)),
  };
};
