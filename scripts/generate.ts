import { writeFileSync } from "node:fs";
import { exportSql } from "drizzle-kit/cli";

const result = await exportSql({ dialect: "sqlite", schema: "packages/stats-store/src/schema.ts" });
if (result.status !== "ok") throw new Error("Stats store schema generation failed.");
writeFileSync(
  "packages/stats-store/src/statements.json",
  `${JSON.stringify(result.statements, null, 2)}\n`,
);
