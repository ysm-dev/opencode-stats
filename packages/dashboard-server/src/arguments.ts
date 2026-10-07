import { parseArgs } from "node:util";
import * as Schema from "effect/Schema";

const port = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(65535),
);

export const parseArguments = (
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: process arguments are narrowed to supported flags and a valid TCP port
  input: unknown,
): {
  readonly port: number;
  readonly db: string;
  readonly starter: "plugin" | "terminal";
  readonly databaseSource?: string;
} => {
  const args = Schema.decodeUnknownSync(Schema.Array(Schema.String))(input);
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", default: "22439" },
      db: { type: "string" },
      starter: { type: "string", default: "terminal" },
      "db-source": { type: "string" },
    },
    strict: true,
  });
  return {
    port: Schema.decodeUnknownSync(port)(values.port),
    db: Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)))(values.db),
    starter: Schema.decodeUnknownSync(Schema.Literals(["plugin", "terminal"]))(values.starter),
    ...(values["db-source"] === undefined
      ? {}
      : {
          databaseSource: Schema.decodeUnknownSync(
            Schema.Literals([
              "(from `--db`)",
              "(the plugin's `db` option)",
              "(`OPENCODE_DB`)",
              "(`OPENCODE_DB` in OpenCode's service config)",
              "(OpenCode's data folder)",
            ]),
          )(values["db-source"]),
        }),
  };
};
