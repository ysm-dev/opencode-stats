import { expect, it, vi } from "vitest";
import { run } from "./main.ts";
import { fixture } from "../testing/server.ts";

it.each([true, false])(
  "passes stderr terminal colour support (%s) through the child pipe",
  async (tty) => {
    const server = await fixture(
      "process.stderr.write('colour=' + process.env.OPENCODE_STATS_COLOR + '\\n'); process.exit(1);",
    );
    const previous = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.stubGlobal("Bun", { version: "1.4.2" });
    Object.defineProperty(process.stderr, "isTTY", { value: tty, configurable: true });
    try {
      expect(await run(["--no-open"], server)).toBe(1);
      expect(error.mock.calls).toEqual([
        [`colour=${tty ? "1" : "0"}\n`],
        ["Can't start: dashboard server stopped.\n"],
      ]);
    } finally {
      if (previous) Object.defineProperty(process.stderr, "isTTY", previous);
      else Reflect.deleteProperty(process.stderr, "isTTY");
      error.mockRestore();
      vi.unstubAllGlobals();
      await server.clean();
    }
  },
);
