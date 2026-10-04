import { describe, expect, it } from "vitest";
import { parseArguments } from "./arguments.ts";

describe("dashboard server arguments", () => {
  it("keeps the fixed default and accepts an explicit port", () => {
    expect(parseArguments([])).toEqual({ port: 22439 });
    expect(parseArguments(["--port", "22440"])).toEqual({ port: 22440 });
    expect(parseArguments(["--port=1"])).toEqual({ port: 1 });
    expect(parseArguments(["--port", "65535"])).toEqual({ port: 65535 });
  });
  it.each(
    [
      null,
      [1],
      ["--host", "0.0.0.0"],
      ["--port"],
      ["22440"],
      ["--port", "0"],
      ["--port", "65536"],
      ["--port", "1.5"],
      ["--port", "text"],
      ["--port", "Infinity"],
    ].map((input) => ({ input })),
  )("rejects bad flags: $input", ({ input }) => {
    expect(() => parseArguments(input)).toThrow(/./u);
  });
});
