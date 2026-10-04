import type { Check } from "./verify-gates.ts";

export function* scopeChecks(extension: string): Generator<Check> {
  const file = `packages/dashboard/src/gate-canary.${extension}`;
  yield {
    gate: `formatting (${extension})`,
    files: { [file]: "export    const badlyFormatted=1\n" },
    command: ["format:check"],
    expect: [`gate-canary.${extension}`],
  };
  yield {
    gate: `types (${extension})`,
    files: { [file]: 'export const bad: number = "not a number";\n' },
    command: ["typecheck"],
    expect: ["TS2322", `gate-canary.${extension}`],
  };
  for (const directory of ["packages/e2e/tests", "packages/opencode-stats/testing"]) {
    const path = `${directory}/gate-canary.${extension}`;
    yield {
      gate: `test-only folders checked by types (${path})`,
      files: { [path]: 'export const bad: number = "not a number";\n' },
      command: ["typecheck"],
      expect: ["TS2322", `gate-canary.${extension}`],
    };
    yield {
      gate: `test-only folders checked by dead code (${path})`,
      files: { [path]: "export const unused = 1;\n" },
      command: ["knip"],
      expect: ["Unused files", `gate-canary.${extension}`],
    };
    const duplicate =
      "export const clone = (n: number): number => {\n" +
      Array.from({ length: 30 }, (_, i) => `const value${i} = n * ${i};`).join("\n") +
      "\nreturn n;\n};\n";
    yield {
      gate: `test-only folders checked by duplication (${path})`,
      files: { [path]: duplicate, [`${directory}/gate-canary-clone.${extension}`]: duplicate },
      command: ["dup"],
      expect: ["Clone found"],
    };
  }
  yield {
    gate: `type-aware lint (${extension})`,
    files: { [file]: "export const floating = (): void => { Promise.resolve(1); };\n" },
    command: ["lint", file],
    expect: ["no-floating-promises"],
  };
  for (const gate of ["test", "mutate"]) {
    yield {
      gate: `testing code and contracts excluded from ${gate} (${extension})`,
      files: {
        [`packages/dashboard/src/testing/gate-canary.${extension}`]:
          "export const untested = (n: number): number => n + 1;\n",
        [`packages/dashboard-server/src/gate-canary.contract.test.${extension}`]:
          'throw new Error("Contracts must not run in Vitest");\n',
        [`packages/dashboard/src/gate-canary.contract.test.${extension}`]:
          'throw new Error("Contracts must not run in Vitest");\n',
      },
      command: [gate],
      expect: [],
      accepts: true,
    };
  }
  const artifacts = ["dist", ".release", ".dev"].flatMap((folder) => [
    `${folder}/gate-canary.${extension}`,
    `packages/dashboard/src/${folder}/gate-canary.${extension}`,
    `scripts/${folder}/gate-canary.${extension}`,
  ]);
  for (const gate of [
    "format:check",
    "lint",
    "typecheck",
    "test",
    "mutate",
    "exceptions",
    "knip",
    "dup",
  ]) {
    const content =
      gate === "exceptions"
        ? "// @ts-ignore -- forbidden outside artifacts\nexport const fine = 1;\n"
        : gate === "typecheck"
          ? 'export const invalid: number = "broken";\n'
          : gate === "dup"
            ? "export const cloned = (n: number): number => {\n" +
              Array.from({ length: 30 }, (_, i) => `const value${i} = n * ${i};`).join("\n") +
              "\nreturn n;\n};\n"
            : "export   const ignored=(n: any): any=>n+1\n";
    yield {
      gate: `artifacts excluded from ${gate} (${extension})`,
      files: Object.fromEntries(artifacts.map((path) => [path, content])),
      command: [gate],
      expect: [],
      accepts: true,
    };
  }
}
