import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: platform bind errors are narrowed to a safe startup message
const failure = (input: unknown, port: number): Error => {
  if (Predicate.hasProperty(input, "cause")) return failure(input.cause, port);
  const held = Predicate.hasProperty(input, "code") && input.code === "EADDRINUSE";
  return new Error(
    held
      ? `Can't start: 127.0.0.1:${port} is in use by another program. Free it, or pass \`--port <n>\`.`
      : `Can't start: couldn't bind 127.0.0.1:${port}.`,
  );
};

export const bind = <A, E, R>(adapter: Layer.Layer<A, E, R>, port: number) =>
  adapter.pipe(
    Layer.catchCause((cause) =>
      Layer.effectContext(Effect.fail(failure(Cause.squash(cause), port))),
    ),
  );
