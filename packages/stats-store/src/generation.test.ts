import { fileURLToPath } from "node:url";
import { exportSql } from "drizzle-kit/cli";
import { expect, it } from "vitest";
import statements from "./statements.json" with { type: "json" };

it("has fresh create statements from the TypeScript schema, generated in process", async () => {
  const result = await exportSql({
    dialect: "sqlite",
    schema: fileURLToPath(new URL("./schema.ts", import.meta.url)),
  });
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Generation failed");
  expect(result.statements).toEqual(statements);
});
