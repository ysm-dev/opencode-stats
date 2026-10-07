import { describe, expect, it } from "vitest";
import { parseArguments } from "./arguments.ts";

describe("dashboard server arguments", () => {
  it("keeps the fixed default and accepts an explicit port", () => {
    for (const [args, port] of [
      [[], 22439],
      [["--port", "22440"], 22440],
      [["--port=1"], 1],
      [["--port", "65535"], 65535],
    ] as const) {
      expect(parseArguments([...args, "--db", "synthetic.db"])).toEqual({
        port,
        db: "synthetic.db",
        starter: "terminal",
      });
    }
  });
  it.each(
    [
      null,
      [],
      ["--db", ""],
      [1],
      ["--host", "0.0.0.0"],
      ["--db", "synthetic.db", "--host", "0.0.0.0"],
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
