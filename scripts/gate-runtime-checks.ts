import type { Check } from "./verify-gates.ts";

export function* runtimeChecks(extension: string): Generator<Check> {
  const pluginFile = `packages/opencode-stats/src/gate-canary.${extension}`;
  yield {
    gate: `OpenCode plugin runtime import forbidden (${extension})`,
    files: {
      [pluginFile]:
        'import { Plugin } from "@opencode/plugin";\nexport const forbidden = Plugin.define;\n',
    },
    command: ["lint", pluginFile],
    expect: [
      "eslint(no-restricted-imports)",
      "@opencode/plugin",
      "OpenCode plugin imports must be types only.",
      `gate-canary.${extension}`,
    ],
  };
  yield {
    gate: `OpenCode plugin type import allowed (${extension})`,
    files: {
      [pluginFile]:
        'import type { Plugin } from "@opencode/plugin";\nexport type Context = Plugin.Context;\n',
    },
    command: ["lint", pluginFile],
    expect: [],
    accepts: true,
  };
  const artifacts = ["engine", "browser-copy"].flatMap((runtime) =>
    ["dist", ".release", ".dev"].flatMap((folder) =>
      ["src", "src/testing"].map(
        (source) => `packages/${runtime}/${source}/${folder}/gate-canary.${extension}`,
      ),
    ),
  );
  yield {
    gate: `runtime and test type programs exclude artifacts (${extension})`,
    files: Object.fromEntries(
      artifacts.map((path) => [path, 'export const invalid: number = "artifact";\n']),
    ),
    command: ["typecheck"],
    expect: [],
    accepts: true,
  };
  for (const [runtime, global] of [
    ["engine", "document"],
    ["browser-copy", "Bun"],
    ["browser-copy", "process"],
    ["browser-copy", "document"],
    ["engine", "Bun"],
    ["engine", "process"],
  ] as const) {
    const file = `packages/${runtime}/src/gate-canary.${extension}`;
    yield {
      gate: `${runtime} cannot use ${global} (${extension})`,
      files: { [file]: `export const forbiddenGlobal = ${global};\n` },
      command: ["typecheck"],
      expect: ["Cannot find name", global, `gate-canary.${extension}`],
    };
  }
}
