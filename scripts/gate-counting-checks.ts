import { readFileSync } from "node:fs";
import type { Check } from "./verify-gates.ts";

const store = "packages/stats-store/src";
export function* countingChecks(extension: string): Generator<Check> {
  const schema = readFileSync(`${store}/schema.ts`, "utf8");
  const source = readFileSync(`${store}/source.ts`, "utf8");
  const types = readFileSync(`${store}/testing/types.ts`, "utf8");
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
        "json_extract(${messages.data}, '$.time.created')",
        "json_extract(${messages.data}, '$.time.created') + 1",
      ),
      [`${store}/source.ts`]: `export {readSource} from "./gate-canary.${extension}";\n`,
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
