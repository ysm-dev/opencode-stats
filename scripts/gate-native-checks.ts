import { readFileSync } from "node:fs";
import metadata from "../native/sqlite/manifest.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

export function* nativeChecks(extension: string): Generator<Check> {
  yield {
    gate: `native library checksum (${extension})`,
    files: { "native/sqlite/manifest.json": JSON.stringify({ ...metadata, sha256: "changed" }) },
    command: ["native:prepare"],
    expect: ["Native SQLite artifact checksum mismatch"],
  };
  yield {
    gate: `native x64 slice checksum (${extension})`,
    files: {
      "native/sqlite/manifest.json": JSON.stringify({
        ...metadata,
        slices: { ...metadata.slices, x86_64: "changed" },
      }),
    },
    command: ["native:prepare"],
    expect: ["Native SQLite architecture/slice checksum mismatch"],
  };
  const source = "packages/stats-store/src/sqlite-library.bun.ts";
  yield {
    gate: `native runtime refuses tampered library (${extension})`,
    files: {
      [`packages/stats-store/src/gate-native-canary.${extension}`]: readFileSync(
        source,
        "utf8",
      ).replace("hash !== metadata.sha256", "false"),
      [source]: `export * from "./gate-native-canary.${extension}";\n`,
    },
    command: ["test", "packages/stats-store/src/sqlite-library.bun.test.ts"],
    expect: ["refuses changed library bytes", "failed"],
  };
}
