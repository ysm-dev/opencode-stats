import {
  mapSessionFields,
  mapTokenFields,
  type DimensionName,
  type SessionFact,
} from "@opencode-stats/browser-copy";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";

export const filterNames: readonly DimensionName[] = [
  ...Array.from({ length: 7 }, (_, code) => ({
    dimension: "model",
    code,
    id: `provider-${code % 2}/model-${code}`,
    name: `Model ${code}`,
  })),
  ...Array.from({ length: 2 }, (_, code) => ({
    dimension: "provider",
    code,
    id: `provider-${code}`,
    name: `Provider ${code}`,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    dimension: "project",
    code: 100 + i,
    id: `project-${i}`,
    name: `Project ${i}`,
  })),
  ...["default", "high"].map((name, i) => ({ dimension: "variant", code: 10 + i, id: name, name })),
  ...["build", "plan"].map((name, i) => ({ dimension: "agent", code: 20 + i, id: name, name })),
  { dimension: "session", code: 200, id: "session-root", name: "Synthetic session" },
  { dimension: "session", code: 201, id: "session-child", name: "Synthetic subagent" },
  { dimension: "session", code: 202, id: "session-grandchild", name: "Synthetic nested subagent" },
];
export const filterSessions: readonly SessionFact[] = [
  { code: 200, parent: null, session: 200, project: 100, fork: null },
  { code: 201, parent: 200, session: 200, project: 100, fork: null },
  { code: 202, parent: 201, session: 200, project: 100, fork: null },
];
export const filterSteps = Array.from({ length: 14 }, (_, i) => ({
  start: Date.parse(i < 7 ? "2026-10-01T12:00Z" : "2026-10-07T12:00Z"),
  ...mapTokenFields((kind) =>
    kind === "input" ? ((i % 7) + 1) * (i < 7 ? 10 : 100) : kind === "cacheRead" ? null : 0,
  ),
  model: i % 7,
  provider: (i % 7) % 2,
  project: 100 + (i % 2),
  variant: 10 + (i % 2),
  agent: 20 + (i % 2),
  session: 200,
  subagent: i % 7 > 4 ? 202 : i % 7 === 4 ? 201 : null,
}));
export const filterMetadata = {
  names: filterNames,
  projects: new Float64Array([100, 101]),
  sessions: mapSessionFields((field) =>
    Float64Array.from(filterSessions, (session) => session[field] ?? NaN),
  ),
};
export const filterCopy = () => syntheticCopy(filterSteps, filterMetadata);
