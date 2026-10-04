import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("pins the four stable SqlError paths and rejects widened inferred transaction error channels", () => {
  const folder = mkdtempSync(join(tmpdir(), "stats-store-type-canary-"));
  try {
    const broken = join(folder, "drizzle-orm");
    const dependencies = fileURLToPath(new URL("../node_modules", import.meta.url));
    cpSync(realpathSync(join(dependencies, "drizzle-orm")), broken, { recursive: true });
    const manifest = join(broken, "package.json");
    writeFileSync(
      manifest,
      readFileSync(manifest, "utf8").replace("1.0.0-rc.5-5935859", "0.0.0-canary"),
    );
    symlinkSync(dependencies, join(broken, "node_modules"));
    for (const path of [
      "effect-sqlite-node/session.d.ts",
      "effect-sqlite-bun/session.d.ts",
      "sqlite-core/effect/db.d.ts",
      "sqlite-core/effect/session.d.ts",
    ]) {
      const file = join(broken, path);
      expect(readFileSync(file, "utf8")).toContain('from "effect/sql/SqlError"');
      expect(readFileSync(file, "utf8")).not.toContain('from "effect/unstable/sql/SqlError"');
      writeFileSync(
        file,
        readFileSync(file, "utf8").replaceAll(
          "effect/sql/SqlError",
          "effect/unstable/sql/SqlError",
        ),
      );
    }
    const config = join(folder, "tsconfig.json");
    const unsafe = join(folder, "unsafe.d.ts");
    writeFileSync(unsafe, "export type SqlError = ReturnType<typeof JSON.parse>;\n");
    writeFileSync(
      config,
      JSON.stringify({
        extends: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
        compilerOptions: {
          types: [],
          paths: { "drizzle-orm/*": [join(broken, "*")], "effect/unstable/sql/SqlError": [unsafe] },
        },
        include: [fileURLToPath(new URL("./testing/types.ts", import.meta.url))],
      }),
    );
    const result = spawnSync("bunx", ["tsc", "--noEmit", "-p", config], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Type 'true' does not satisfy the constraint 'false'");
  } finally {
    rmSync(folder, { recursive: true });
  }
});
