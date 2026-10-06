import type { syntheticDatabase } from "./index.ts";
export const fiveTokens = { input: 11, cache: { read: 22, write: 33 }, output: 44, reasoning: 55 };

export function fingerprintFixture(writer: ReturnType<typeof syntheticDatabase>) {
  writer.session("ses-fingerprint");
  writer.message({
    id: "msg-five",
    session: "ses-fingerprint",
    seq: 0,
    start: 1000,
    tokens: fiveTokens,
  });
  writer.message({ id: "msg-missing", session: "ses-fingerprint", seq: 1, start: 2000 });
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
}
