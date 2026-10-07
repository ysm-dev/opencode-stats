import { withWaiver } from "./gate-manifest-checks.ts";
import type { Check } from "./verify-gates.ts";

export function* lintChecks(extension: string): Generator<Check> {
  const file = `packages/dashboard/src/gate-canary.${extension}`;
  const cases = [
    [
      "unused disable",
      "// oxlint-disable-next-line eslint/no-console -- unused canary\nexport const fine = 1;\n",
      "unused",
    ],
    [
      "described TypeScript directive",
      "// @ts-expect-error\nexport const broken: number = 'no';\n",
      "ban-ts-comment",
    ],
    [
      "production testing import",
      'import type { Example } from "@opencode-stats/dashboard/testing";\nexport type GateCanary = Example;\n',
      "no-restricted-imports",
    ],
  ] as const;
  for (const [gate, content, rule] of cases) {
    yield {
      gate: `${gate} (${extension})`,
      files: { [file]: content },
      command: ["lint", file],
      expect: [rule],
    };
  }
  for (const path of [
    `packages/dashboard/src/gate-canary.test.${extension}`,
    `packages/dashboard/src/testing/gate-canary.${extension}`,
  ]) {
    yield {
      gate: `testing import allowed (${path})`,
      files: {
        [path]:
          'import type { Example } from "@opencode-stats/dashboard/testing";\nexport type GateCanary = Example;\n',
      },
      command: ["lint", path],
      expect: [],
      accepts: true,
    };
  }
  for (const [gate, content, rule] of [
    ["edge branch", "export const branch = (n: number): number => n ? 1 : 0;\n", "complexity"],
    [
      "edge nested function",
      "export const nested = (): (() => number) => () => 1;\n",
      "complexity",
    ],
    ["edge lines", "// canary\n".repeat(31), "max-lines"],
  ]) {
    yield {
      gate: `${gate} (${extension})`,
      files: {
        "quality-exceptions.json": withWaiver(
          `packages/opencode-stats/src/gate-canary.${extension}`,
        ),
        [`packages/opencode-stats/src/gate-canary.${extension}`]: content ?? "",
      },
      command: ["lint", `packages/opencode-stats/src/gate-canary.${extension}`],
      expect: [rule ?? ""],
    };
  }
  yield {
    gate: `clean edge (${extension})`,
    files: {
      "quality-exceptions.json": withWaiver(`packages/opencode-stats/src/gate-canary.${extension}`),
      [`packages/opencode-stats/src/gate-canary.${extension}`]: "export const fine = 1;\n",
    },
    command: ["lint", `packages/opencode-stats/src/gate-canary.${extension}`],
    expect: [],
    accepts: true,
  };
  yield {
    gate: `launcher cannot import Effect (${extension})`,
    files: {
      [`packages/launcher/src/gate-canary.${extension}`]:
        'import * as Effect from "effect/Effect";\nexport const forbidden = Effect.succeed(1);\n',
    },
    command: ["typecheck"],
    expect: ["TS2307", `gate-canary.${extension}`, "effect/Effect"],
  };
}
