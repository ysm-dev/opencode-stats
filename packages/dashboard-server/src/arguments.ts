import { parseArgs } from "node:util";
import * as Schema from "effect/Schema";

const port = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(65535),
);

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: process arguments are narrowed to supported flags and a valid TCP port
export const parseArguments = (input: unknown): { readonly port: number } => {
  const args = Schema.decodeUnknownSync(Schema.Array(Schema.String))(input);
  const { values } = parseArgs({
    args,
    options: { port: { type: "string", default: "22439" } },
    strict: true,
  });
  return { port: Schema.decodeUnknownSync(port)(values.port) };
};
