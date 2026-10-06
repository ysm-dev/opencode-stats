import type { syntheticDatabase } from "./index.ts";
import { cachedCatalog, rate, tier } from "./pricing.ts";
export const fiveTokens = { input: 11, cache: { read: 22, write: 33 }, output: 44, reasoning: 55 };

export function fingerprintFixture(writer: ReturnType<typeof syntheticDatabase>) {
  writer.catalog(
    cachedCatalog(
      {
        "synthetic-provider": {
          name: "Synthetic Provider",
          models: {
            "synthetic-model": {
              name: "Synthetic Model",
              cost: { ...rate(), tiers: [tier(65, 2)], context_over_200k: rate(99) },
              experimental: { modes: { pro: { cost: rate(3) } } },
            },
          },
        },
        other: { models: { model: { cost: rate(0, 0, 0, 0) } } },
      },
      100,
      "fingerprint-catalog",
    ),
  );
  writer.session("ses-fingerprint");
  writer.message({
    id: "msg-five",
    session: "ses-fingerprint",
    seq: 0,
    start: 1000,
    tokens: fiveTokens,
    streamEnd: 1200,
    completed: 1300,
    error: "api.error",
    tools: [
      { id: "shell", name: "bash", status: "completed", ran: 1050, completed: 1100 },
      { id: "subagent", name: "task", status: "error", error: "aborted", completed: 1200 },
      {
        id: "patch",
        name: "apply_patch",
        status: "error",
        error: "tool.execution",
        ran: 1050,
        completed: 1150,
      },
      { id: "invalid", name: "invalid", status: "completed", completed: 1200 },
      { id: "todo", name: "todowrite", status: "completed" },
      { id: "mcp", name: "server.lookup", status: "error", error: "permission.rejected" },
      { id: "plugin", name: "plugin.custom", status: "error", error: "tool.interrupted" },
      {
        id: "execute",
        name: "execute",
        status: "completed",
        ran: 1100,
        completed: 1100,
        nested: [{ id: "nested", name: "hidden.lookup", status: "completed" }],
      },
      { id: "running", name: "read", status: "running", ran: 1190 },
      { id: "streaming", name: "read", status: "streaming" },
    ],
    cost: 0.25,
  });
  writer.message({
    id: "msg-missing",
    session: "ses-fingerprint",
    seq: 1,
    start: 2000,
    error: "aborted",
  });
  writer.message({
    id: "msg-zero",
    session: "ses-fingerprint",
    seq: 2,
    start: 3000,
    tokens: { input: 0, cache: { read: 0, write: 0 }, output: 0, reasoning: 0 },
  });
  writer.message({
    id: "msg_abcdefghijklmnopqrstuvwxyz_123",
    session: "ses-fingerprint",
    seq: 3,
    start: 4000,
    tokens: { input: 100 },
  });
  writer.message({
    id: "msg-user",
    session: "ses-fingerprint",
    seq: 4,
    start: 5000,
    type: "user",
    tokens: { input: 1000 },
  });
  writer.session("ses-child", "ses-fingerprint", { title: "Nested" });
  writer.session("ses-grandchild", "ses-child");
  writer.message({
    id: "msg-nested",
    session: "ses-grandchild",
    seq: 0,
    start: 6000,
    provider: "other",
    model: "model",
    variant: "high",
    agent: "explore",
    tokens: { output: 1 },
  });
  writer.fork("ses-fingerprint", "ses-fork");
  writer.fork("ses-fork", "ses-fork-again", 2);
  writer.message({
    id: "msg-fork-own",
    session: "ses-fork-again",
    seq: 10,
    start: 7000,
    variant: "max",
  });
  writer.project("global", "/", "Ignored");
  writer.move("ses-fork-again", "global");
  writer.title("ses-fingerprint", "A synthetic session");
  writer.message({
    id: "prompt-next",
    session: "ses-fingerprint",
    seq: 5,
    start: 8000,
    type: "user",
  });
  writer.message({
    id: "prompt-synthetic",
    session: "ses-fingerprint",
    seq: 6,
    start: 8100,
    type: "synthetic",
  });
  writer.message({
    id: "step-after",
    session: "ses-fingerprint",
    seq: 7,
    start: 8200,
    streamEnd: 8200,
    completed: 8400,
    provider: "other",
    model: "model",
    variant: "high",
    agent: "plan",
  });
  writer.message({ id: "prompt-child", session: "ses-child", seq: 0, start: 8300, type: "user" });
  writer.message({
    id: "prompt-unassigned",
    session: "ses-fingerprint",
    seq: 8,
    start: 8500,
    type: "user",
  });
  writer.session("ses-pricing-mode");
  writer.message({
    id: "step-mode",
    session: "ses-pricing-mode",
    seq: 0,
    start: 9000,
    model: "synthetic-model-pro",
    tokens: { ...fiveTokens, input: 1 },
    cost: 0,
  });
}
