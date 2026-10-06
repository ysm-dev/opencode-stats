import { readFileSync } from "node:fs";
import { withWaiver } from "./gate-manifest-checks.ts";
import type { Check } from "./verify-gates.ts";

export function* exceptionChecks(extension: string): Generator<Check> {
  const forms = [
    "/* oxlint-disable-next-line eslint/no-console -- block canary */",
    "// oxlint-disable eslint/no-console -- whole-file canary",
    "// eslint-disable-next-line no-console -- canary",
    "// @ts-ignore -- canary",
    "// @ts-nocheck -- canary",
    "// @ts-check -- canary",
    "// v8 ignore next -- canary",
    "// c8 ignore next -- canary",
    "// istanbul ignore next -- canary",
    "// jscpd:ignore-start -- canary",
    "// oxlint-disable-next-line -- blanket canary",
    "// oxlint-disable-next-line eslint/no-console",
    "// oxlint-disable-next-line typescript/no-explicit-any -- canary",
    "// oxlint-disable-next-line no-explicit-any -- canary",
    "// oxlint-disable-next-line typescript/no-unsafe-assignment -- canary",
    "// @ts-expect-error",
    "// oxlint-disable-next-line typescript/no-restricted-types -- not a declared boundary",
  ];
  for (const directory of ["packages/dashboard/src", "scripts"]) {
    const file = `${directory}/gate-canary.${extension}`;
    for (const form of forms) {
      yield {
        gate: `forbidden suppression ${form} (${file})`,
        files: { [file]: `${form}\nexport const fine = 1;\n` },
        command: ["exceptions"],
        expect: ["ERROR", file],
      };
    }
    yield {
      gate: `reasoned line suppression (${file})`,
      files: {
        [file]:
          "// oxlint-disable-next-line eslint/no-console -- canary reason\nconsole.log(1);\n// @ts-expect-error -- described canary\nconst broken: number = 'no';\n",
      },
      command: ["exceptions"],
      expect: [],
      accepts: true,
    };
    yield {
      gate: `suppression text is not a comment (${file})`,
      files: { [file]: 'export const sample = "// @ts-ignore";\n' },
      command: ["exceptions"],
      expect: [],
      accepts: true,
    };
  }
  const file = `packages/dashboard/src/gate-canary.${extension}`;
  for (const [gate, gates, expect] of [
    ["any manifest entry", ["typescript/no-explicit-any"], "forbidden gate"],
    ["unsafe manifest entry", ["typescript/no-unsafe-call"], "forbidden gate"],
  ] as const) {
    yield {
      gate: `${gate} (${extension})`,
      files: {
        "quality-exceptions.json": withWaiver(file, [...gates]),
        [file]: "export const fine = 1;\n",
      },
      command: ["exceptions"],
      expect: [expect],
    };
  }
  yield {
    gate: `excused file needs owner (${extension})`,
    files: { "quality-exceptions.json": withWaiver(file), [file]: "export const fine = 1;\n" },
    command: ["exceptions"],
    expect: ["missing CODEOWNERS", file],
  };
  const config = readFileSync(".oxlintrc.ts", "utf8");
  yield {
    gate: `edge override matches manifest (${extension})`,
    files: {
      ".oxlintrc.ts": config.replace(
        'entry.gates.includes("coverage")',
        'entry.gates.includes("nonexistent")',
      ),
    },
    command: ["exceptions"],
    expect: ["edge override differs"],
  };
}
