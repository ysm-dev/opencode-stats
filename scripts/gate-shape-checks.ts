import duration from "../packages/duration/package.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

export function* shapeChecks(): Generator<Check> {
  yield {
    gate: "artifacts excluded from shape",
    files: Object.fromEntries(
      ["dist", ".release", ".dev"].map((directory) => [
        `packages/${directory}/package.json`,
        JSON.stringify({ exports: "./dist/index.js" }),
      ]),
    ),
    command: ["shape"],
    expect: [],
    accepts: true,
  };
  for (const field of ["exports", "bin", "types"]) {
    yield {
      gate: `package ${field} must point into src`,
      files: {
        "packages/duration/package.json": JSON.stringify({
          ...duration,
          [field]: "./dist/index.js",
        }),
      },
      command: ["shape"],
      expect: ["packages/duration/package.json", field, "src/"],
    };
  }
  yield {
    gate: "conditional exports cannot escape src",
    files: {
      "packages/duration/package.json": JSON.stringify({
        ...duration,
        exports: { ".": { types: "./src/../../cli/src/index.ts", default: "./src/index.ts" } },
      }),
    },
    command: ["shape"],
    expect: ["exports", "src/"],
  };
  yield {
    gate: "conditional source exports allowed",
    files: {
      "packages/duration/package.json": JSON.stringify({
        ...duration,
        exports: {
          ".": { types: "./src/index.ts", default: "./src/index.ts" },
          "./*": "./src/*.ts",
        },
      }),
    },
    command: ["shape"],
    expect: [],
    accepts: true,
  };
}
