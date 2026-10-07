import { readFileSync } from "node:fs";
import type { Check } from "./verify-gates.ts";

const store = "packages/stats-store/src";
export function* countingChecks(extension: string): Generator<Check> {
  const wire = "packages/browser-copy/src";
  yield {
    gate: `browser-copy format fingerprint (${extension})`,
    files: {
      [`${wire}/gate-canary.${extension}`]: readFileSync(`${wire}/binary.ts`, "utf8").replace(
        "0x5354434f",
        "0x5354434e",
      ),
      [`${wire}/binary.ts`]: `export * from "./gate-canary.${extension}";\n`,
    },
    command: ["test", `${wire}/binary.test.ts`],
    expect: ["change the format version"],
  };
  const schema = readFileSync(`${store}/schema.ts`, "utf8");
  const source = readFileSync(`${store}/source-reader.ts`, "utf8");
  const types = readFileSync(`${store}/testing/types.ts`, "utf8");
  yield {
    gate: `OpenCode exact schema recognition (${extension})`,
    files: {
      [`${store}/gate-canary.${extension}`]: readFileSync(
        `${store}/source-schema.ts`,
        "utf8",
      ).replace("row.type.toUpperCase()", '"SILENTLY_WRONG_TYPE"'),
      [`${store}/source-schema.ts`]: `export * from "./gate-canary.${extension}";\n`,
    },
    command: ["test", `${store}/source-schema.test.ts`],
    expect: ["recognizes the complete pinned", "failed"],
  };
  yield {
    gate: `stats-store statements freshness (${extension})`,
    files: {
      [`${store}/gate-canary.${extension}`]: schema.replace(
        "input: integer(),",
        "input: integer().notNull(),",
      ),
      [`${store}/schema.ts`]: `export * from "./gate-canary.${extension}";\n`,
    },
    command: ["test", `${store}/generation.test.ts`],
    expect: ["has fresh create statements", "failed"],
  };
  yield {
    gate: `stats-store counting fingerprint (${extension})`,
    files: {
      [`${store}/gate-canary.${extension}`]: source.replace(
        "json_extract(data,'$.time.created')",
        "json_extract(data,'$.time.created') + 1",
      ),
      [`${store}/source-reader.ts`]: `export * from "./gate-canary.${extension}";\n`,
    },
    command: ["test", `${store}/fingerprint.test.ts`],
    expect: ["change the stats-store version"],
  };
  yield {
    gate: `inferred transaction not-any guard (${extension})`,
    files: {
      [`${store}/testing/gate-canary.${extension}`]: types.replace(
        "tx.select({ start: steps.start, input: steps.input }).from(steps)",
        'Effect.fail(JSON.parse("null"))',
      ),
      [`${store}/testing/types.ts`]: `export * from "./gate-canary.${extension}";\n`,
    },
    command: ["typecheck"],
    expect: ["does not satisfy the constraint 'false'"],
  };
  yield {
    gate: `stats-store production strict dead code (${extension})`,
    files: {
      [`${store}/gate-canary.${extension}`]: "export const orphan = 1;\n",
      [`${store}/testing/gate-canary.test.${extension}`]: `import {expect,it} from "vitest";\nimport {orphan} from "../gate-canary.${extension}";\nit("test-only reachability",()=>{expect(orphan).toBe(1);});\n`,
    },
    command: ["knip"],
    expect: ["Unused files", `gate-canary.${extension}`],
  };
}
