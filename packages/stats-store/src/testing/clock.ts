import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Duration from "effect/Duration";
import type * as Scope from "effect/Scope";

export const controlledClock = Effect.gen(function* () {
  let now = 0;
  const waits = yield* Queue.unbounded<{ delay: number; at: number; wake: () => void }>();
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: () => BigInt(now) * 1000000n,
    currentTimeNanos: Effect.sync(() => BigInt(now) * 1000000n),
    monotonicTimeNanosUnsafe: () => BigInt(now) * 1000000n,
    monotonicTimeNanos: Effect.sync(() => BigInt(now) * 1000000n),
    sleep: (duration) =>
      Effect.callback((resume) => {
        Queue.offerUnsafe(waits, {
          delay: Duration.toMillis(duration),
          at: now + Duration.toMillis(duration),
          wake: () => resume(Effect.void),
        });
      }),
  };
  const wake = Effect.gen(function* () {
    const wait = yield* Queue.take(waits);
    wait.wake();
    yield* Queue.peek(waits);
  });
  const tick = Effect.gen(function* () {
    const wait = yield* Queue.peek(waits);
    now += wait.delay;
    yield* wake;
  });
  const advance = (milliseconds: number) =>
    Effect.gen(function* () {
      const wait = yield* Queue.peek(waits);
      now += milliseconds;
      if (now >= wait.at) yield* wake;
    });
  return {
    clock,
    tick,
    advance,
    nextDelay: Queue.peek(waits).pipe(Effect.map((wait) => wait.delay)),
    setTime: (timestamp: number) => {
      now = timestamp;
    },
  };
});

export function runWithClock<A, E>(
  scenario: (time: Effect.Success<typeof controlledClock>) => Effect.Effect<A, E, Scope.Scope>,
) {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const time = yield* controlledClock;
        return yield* scenario(time).pipe(Effect.provideService(Clock.Clock, time.clock));
      }),
    ),
  );
}
