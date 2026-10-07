import * as Effect from "effect/Effect";
import * as BunDrizzle from "drizzle-orm/effect-sqlite-bun";
import * as NodeDrizzle from "drizzle-orm/effect-sqlite-node";
import { steps } from "../schema.ts";

export const bunProbe = Effect.gen(function* () {
  const db = yield* BunDrizzle.makeWithDefaults();
  return yield* db.transaction((tx) =>
    tx.select({ start: steps.start, input: steps.input }).from(steps),
  );
});
export const nodeProbe = Effect.gen(function* () {
  const db = yield* NodeDrizzle.makeWithDefaults();
  return yield* db.transaction((tx) =>
    tx.select({ start: steps.start, input: steps.input }).from(steps),
  );
});
type IsAny<T> = 0 extends 1 & T ? true : false;
type NotAny<T extends false> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type True<T extends true> = T;
type Rows = Array<{ start: number; input: number | null }>;
export type Guards = [
  NotAny<IsAny<Effect.Success<typeof bunProbe>>>,
  NotAny<IsAny<Effect.Error<typeof bunProbe>>>,
  NotAny<IsAny<Effect.Success<typeof nodeProbe>>>,
  NotAny<IsAny<Effect.Error<typeof nodeProbe>>>,
  True<Equal<Effect.Success<typeof bunProbe>, Rows>>,
  True<Equal<Effect.Success<typeof nodeProbe>, Rows>>,
  NotAny<IsAny<Effect.Error<typeof bunProbe>["_tag"]>>,
  NotAny<IsAny<Effect.Error<typeof nodeProbe>["_tag"]>>,
];
export const guards: Guards = [false, false, false, false, true, true, false, false];
