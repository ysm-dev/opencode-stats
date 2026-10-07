import { expect, it, vi } from "vitest";
import { serverFailure } from "./errors.ts";

it.each([
  [null, "UNEXPECTED", "server"],
  ["PRIVATE_MESSAGE", "UNEXPECTED", "server"],
  [{}, "UNEXPECTED", "server"],
  [{ code: 1 }, "UNEXPECTED", "server"],
  [{ code: "PRIVATE_MESSAGE" }, "UNEXPECTED", "server"],
  [{ code: "EACCES" }, "EACCES", "io"],
  [{ code: "ENOSPC" }, "ENOSPC", "io"],
  [{ code: "EADDRINUSE" }, "EADDRINUSE", "io"],
  [{ code: "ENOENT" }, "ENOENT", "io"],
  [{ code: "BIND_FAILED" }, "BIND_FAILED", "io"],
  [Object.assign(() => {}, { code: "EACCES" }), "UNEXPECTED", "server"],
])(
  "maps native error %s to fixed diagnostics without its message, cause or raw stack",
  (input, code, kind) => {
    const failure = serverFailure(input);
    expect(failure.statement).toBe("startup");
    expect(failure.frames).toMatch(/^at \d+:\d+(;at \d+:\d+)*$/u);
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_MESSAGE");
    expect(failure.code).toBe(code);
    expect(failure.kind).toBe(kind);
  },
);

it("handles runtimes that omit stacks without asking the native error for one", () => {
  const NativeError = Error;
  class StacklessError extends NativeError {
    constructor() {
      super();
      Reflect.deleteProperty(this, "stack");
    }
  }
  vi.stubGlobal("Error", StacklessError);
  try {
    expect(
      serverFailure({
        code: "EACCES",
        message: "PRIVATE_MESSAGE",
        stack: "PRIVATE_MESSAGE",
        cause: { code: "PRIVATE_MESSAGE" },
      }),
    ).toEqual({ kind: "io", code: "EACCES", statement: "startup", frames: "" });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps complete bare and parenthesized boundary frame coordinates, not headers or raw library stack text", () => {
  const previous = Object.getOwnPropertyDescriptor(Error, "prepareStackTrace");
  Object.defineProperty(Error, "prepareStackTrace", {
    configurable: true,
    value: () =>
      "own:90:12 ignored\n at /synthetic/file.ts:12:34\n at run (/synthetic/file.ts:56:78)",
  });
  try {
    expect(
      serverFailure({ message: "PRIVATE", stack: "PRIVATE:90:12", cause: new Error("PRIVATE") })
        .frames,
    ).toBe("at 12:34;at 56:78");
  } finally {
    if (previous) Object.defineProperty(Error, "prepareStackTrace", previous);
    else Reflect.deleteProperty(Error, "prepareStackTrace");
  }
});
