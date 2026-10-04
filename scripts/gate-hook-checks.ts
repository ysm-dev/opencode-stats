import type { Check } from "./verify-gates.ts";

export function* hookChecks(): Generator<Check> {
  const file = "scripts/gate-canary-message.txt";
  yield {
    gate: "non-conventional commit rejected by hook",
    files: { [file]: "an arbitrary commit message\n" },
    command: ["lefthook", "run", "commit-msg", file],
    expect: ["Conventional Commit"],
  };
  yield {
    gate: "conventional commit accepted by hook",
    files: {
      [file]: "feat(gates)!: enforce the source policy\n\nBREAKING CHANGE: synthetic canary\n",
    },
    command: ["lefthook", "run", "commit-msg", file],
    expect: [],
    accepts: true,
  };
}
