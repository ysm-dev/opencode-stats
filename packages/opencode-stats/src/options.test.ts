import { expect, it } from "vitest";
import { pluginOptions } from "./options.ts";

it.each([undefined, null, 1, "options", [], () => {}])(
  "rejects a non-object plugin configuration: %s",
  (input) => {
    expect(() => pluginOptions(input)).toThrow(
      "Invalid opencode-stats options: expected an object.",
    );
  },
);

it("defaults only absent options and preserves valid port/path boundaries", () => {
  expect(pluginOptions({})).toEqual({ port: 22439, db: undefined });
  expect(pluginOptions({ port: 1, db: "relative.db" })).toEqual({ port: 1, db: "relative.db" });
  expect(pluginOptions({ port: 65535, db: "/synthetic/absolute.db" })).toEqual({
    port: 65535,
    db: "/synthetic/absolute.db",
  });
});
