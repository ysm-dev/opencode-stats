import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import { ServerProblem } from "./errors.ts";

export class BindProblem extends ServerProblem {
  readonly code: "EADDRINUSE" | "BIND_FAILED";
  constructor(message: string, held: boolean) {
    super(message);
    this.code = held ? "EADDRINUSE" : "BIND_FAILED";
  }
}

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: platform bind errors are narrowed to a safe startup message
const failure = (input: unknown, port: number): Error => {
  if (Predicate.hasProperty(input, "cause")) return failure(input.cause, port);
  const held = Predicate.hasProperty(input, "code") && input.code === "EADDRINUSE";
  return new BindProblem(
    held
      ? `Can't start: 127.0.0.1:${port} is in use by another program. Free it, or pass \`--port <n>\`.`
      : `Can't start: couldn't bind 127.0.0.1:${port}.`,
    held,
  );
};

export const bind = <A, E, R>(adapter: Layer.Layer<A, E, R>, port: number) =>
  adapter.pipe(
    Layer.catchCause((cause) =>
      Layer.effectContext(Effect.fail(failure(Cause.squash(cause), port))),
    ),
  );
