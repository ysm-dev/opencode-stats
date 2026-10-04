import dashboard from "../packages/dashboard/package.json" with { type: "json" };
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
        "packages/dashboard/package.json": JSON.stringify({
          ...dashboard,
          [field]: "./dist/index.js",
        }),
      },
      command: ["shape"],
      expect: ["packages/dashboard/package.json", field, "src/"],
    };
  }
  yield {
    gate: "conditional exports cannot escape src",
    files: {
      "packages/dashboard/package.json": JSON.stringify({
        ...dashboard,
        exports: {
          ".": {
            types: "./src/../../dashboard-server/src/server.ts",
            default: "./src/dashboard.tsx",
          },
        },
      }),
    },
    command: ["shape"],
    expect: ["exports", "src/"],
  };
  yield {
    gate: "conditional source exports allowed",
    files: {
      "packages/dashboard/package.json": JSON.stringify({
        ...dashboard,
        exports: {
          ".": { types: "./src/dashboard.tsx", default: "./src/dashboard.tsx" },
          "./*": "./src/*.ts",
        },
      }),
    },
    command: ["shape"],
    expect: [],
    accepts: true,
  };
}
