import * as fc from "fast-check";
import type { SyntheticMessage, syntheticDatabase } from "./index.ts";

const amount = fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined });
const actionArbitrary = fc.record({
  kind: fc.constantFrom("write", "revert", "delete"),
  session: fc.integer({ min: 0, max: 2 }),
  position: fc.integer({ min: 0, max: 3 }),
  start: fc.integer({ min: -10000, max: 10000 }),
  copied: fc.boolean(),
  input: amount,
  output: amount,
  reasoning: amount,
  read: amount,
  write: amount,
});
export const histories = fc.array(actionArbitrary, { minLength: 1, maxLength: 12 });
type Action = typeof actionArbitrary extends fc.Arbitrary<infer A> ? A : never;
function tokens(action: Action): NonNullable<SyntheticMessage["tokens"]> {
  return {
    ...(action.input === undefined ? {} : { input: action.input }),
    ...(action.output === undefined ? {} : { output: action.output }),
    ...(action.reasoning === undefined ? {} : { reasoning: action.reasoning }),
    cache: {
      ...(action.read === undefined ? {} : { read: action.read }),
      ...(action.write === undefined ? {} : { write: action.write }),
    },
  };
}

export function historyWriter(writer: ReturnType<typeof syntheticDatabase>) {
  const sessions = new Map<string, Map<number, SyntheticMessage>>();
  writer.session("ses-marker");
  sessions.set("ses-marker", new Map());
  return {
    apply(action: Action, index: number) {
      const session = `ses-${action.session}`;
      if (!sessions.has(session)) {
        writer.session(session);
        sessions.set(session, new Map());
      }
      const messages = sessions.get(session)!;
      if (action.kind === "delete") {
        writer.deleteSession(session);
        sessions.delete(session);
      } else if (action.kind === "revert") {
        writer.revert(session, action.position);
        for (const position of messages.keys())
          if (position >= action.position) messages.delete(position);
      } else {
        const previous = messages.get(action.position);
        const message: SyntheticMessage = {
          id:
            previous?.id ??
            (action.copied
              ? `msg_abcdefghijklmnopqrstuvwxyz_${action.session * 4 + action.position}`
              : `msg-${action.session}-${action.position}`),
          session,
          seq: action.position,
          start: action.start,
          tokens: tokens(action),
        };
        writer.message(message);
        messages.set(action.position, message);
      }
      const marker = {
        id: "msg-marker",
        session: "ses-marker",
        seq: 0,
        start: -100000,
        tokens: { output: index },
      };
      writer.message(marker);
      sessions.get("ses-marker")!.set(0, marker);
    },
    expected() {
      const facts = [...sessions.values()].flatMap((messages) => [...messages.values()]);
      return facts
        .filter((message) => !message.id.startsWith("msg_abcdefghijklmnopqrstuvwxyz_"))
        .toSorted((a, b) => a.session.localeCompare(b.session) || a.seq - b.seq)
        .map((message) => ({
          start: message.start,
          input: message.tokens?.input ?? null,
          cacheRead: message.tokens?.cache?.read ?? null,
          cacheWrite: message.tokens?.cache?.write ?? null,
          output: message.tokens?.output ?? null,
          reasoning: message.tokens?.reasoning ?? null,
        }));
    },
  };
}
