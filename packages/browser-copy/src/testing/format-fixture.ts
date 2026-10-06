import { mapFields, sessionFields } from "../facts.ts";
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
      },
    ],
    {
      fromRevision: 2,
      revision: 3,
      historyCompleteFrom: -100,
      sessions: mapFields(sessionFields, (field) =>
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
      ],
    },
  );
