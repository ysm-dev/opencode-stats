import { mapSessionFields, mapPromptFields } from "../facts.ts";
import { syntheticCopy } from "./synthetic.ts";

export const formatFixture = () =>
  syntheticCopy(
    [
      {
        start: 123,
        input: 1,
        cacheRead: 2,
        cacheWrite: null,
        output: 4,
        reasoning: 5,
        provider: 1,
        model: 2,
        variant: 3,
        agent: 4,
        project: 6,
        session: 5,
        subagent: 7,
        streamEnd: 234,
        completed: 345,
        error: 10,
        failed: 1,
        interrupted: 0,
      },
      {
        start: 456,
        streamEnd: null,
        completed: 567,
        error: 11,
        failed: 0,
        interrupted: 1,
        input: null,
        cacheRead: null,
        cacheWrite: null,
        output: null,
        reasoning: null,
      },
      {
        start: 789,
        streamEnd: 789,
        completed: null,
        error: null,
        input: 0,
        cacheRead: 0,
        cacheWrite: 0,
        output: 0,
        reasoning: 0,
      },
    ],
    {
      fromRevision: 2,
      revision: 3,
      historyCompleteFrom: -100,
      promptIds: ["prompt-one", "prompt-unassigned"],
      prompts: mapPromptFields((field) =>
        Float64Array.from(
          [
            { start: 100, provider: 1, model: 2, variant: 3, agent: 4, project: 6, session: 5 },
            {
              start: 400,
              provider: null,
              model: null,
              variant: null,
              agent: null,
              project: 6,
              session: 5,
            },
          ],
          (row) => row[field] ?? NaN,
        ),
      ),
      sessions: mapSessionFields((field) =>
        Float64Array.from(
          [{ code: 5, parent: null, session: 5, project: 6, fork: 7 }],
          (row) => row[field] ?? NaN,
        ),
      ),
      projects: new Float64Array([6]),
      sessionTombstones: new Float64Array([8]),
      projectTombstones: new Float64Array([9]),
      names: [
        { dimension: "session", code: 5, id: "ses-synthetic", name: "Synthetic 🌍" },
        { dimension: "project", code: 6, id: "global", name: "Global" },
        { dimension: "agent", code: 4, id: "build", name: "build" },
        { dimension: "error", code: 10, id: "api", name: "api" },
        { dimension: "error", code: 11, id: "aborted", name: "aborted" },
      ],
    },
  );
