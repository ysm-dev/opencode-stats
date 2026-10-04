import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import schema from "./2.0.22.json" with { type: "json" };

it("pins the complete published OpenCode 2.0.22 bootstrap and migration journal, not our partial reader schema", () => {
  expect(schema.release).toBe("2.0.22");
  expect(schema.commit).toBe("d259ae716379a67bcc35943ba75590f1fc7a1b26");
  expect(schema.statements).toHaveLength(35);
  expect(createHash("sha256").update(JSON.stringify(schema.statements)).digest("hex")).toBe(
    "6216fb1b048f6963b0052e09a540a3c1b3f3ba5a11ec5b255293fd9ef692e233",
  );
  expect(schema.migrations).toHaveLength(48);
  expect(
    createHash("sha256").update(JSON.stringify(schema.migrations.toSorted())).digest("hex"),
  ).toBe("6945eced1fdd20595b92caada6b62c9f6693e650b6473db2853ab670ef91a2f7");
});
