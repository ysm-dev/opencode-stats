import base from "./.oxlintrc.json" with { type: "json" };
import exceptions from "./quality-exceptions.json" with { type: "json" };

export default {
  ...base,
  rules: {
    ...base.rules,
    "eslint/no-restricted-imports": [
      "error",
      { patterns: ["@opencode-stats/*/testing", "@opencode-stats/*/testing/*"] },
    ],
  },
  overrides: [
    {
      files: ["**/*.test.{ts,tsx}", "**/testing/**"],
      rules: { "eslint/no-restricted-imports": "off" },
    },
    {
      files: exceptions
        .filter((entry) => entry.gates.includes("coverage"))
        .map((entry) => entry.path),
      rules: {
        "eslint/max-lines": ["error", { max: 30, skipBlankLines: false, skipComments: false }],
        "complexity/complexity": ["error", { cyclomatic: 1, cognitive: 0, minLines: 0 }],
      },
    },
  ],
};
