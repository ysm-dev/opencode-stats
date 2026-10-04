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
}
