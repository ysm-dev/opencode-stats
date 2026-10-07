import { expect, it } from "vitest";
import { SqlFailure, sqlFailure } from "./errors.ts";

it.each([
  "SQLITE_ERROR",
  "SQLITE_BUSY",
  "SQLITE_FULL",
  "SQLITE_READONLY",
  "SQLITE_CORRUPT",
  "SQLITE_NOTADB",
  "SQLITE_CANTOPEN",
  "SQLITE_CONSTRAINT",
  "SQLITE_IOERR",
  "ENOTDIR",
  "EISDIR",
  "EEXIST",
])("keeps only known SQLite code %s at the library boundary", (code) => {
  const failure = sqlFailure(
    { cause: { cause: { code, message: "PRIVATE_TITLE", stack: "PRIVATE_TITLE" } } },
    "readStore",
  );
  expect(failure.kind).toBe("sqlite");
  expect(failure.code).toBe(code);
  expect(failure.statement).toBe("readStore");
  expect(failure.message).toBe("Stats store build failed.");
  expect(failure.frames).toMatch(/^at \d+:\d+(;at \d+:\d+)*$/u);
  expect(JSON.stringify(failure)).not.toContain("PRIVATE_TITLE");
  expect(sqlFailure(failure, "writeSteps")).toBe(failure);
  expect(sqlFailure({ code: `ERR_${code}` }, "readStore").code).toBe(code);
});

it.each([
  [8, "SQLITE_READONLY"],
  [11, "SQLITE_CORRUPT"],
  [26, "SQLITE_NOTADB"],
  [3, "SQLITE_PERM"],
  [5, "SQLITE_BUSY"],
  [6, "SQLITE_LOCKED"],
  [13, "SQLITE_FULL"],
  [14, "SQLITE_CANTOPEN"],
  [261, "SQLITE_BUSY"],
  [1, "SQLITE_ERROR"],
])("narrows Node SQLite damage code %i without the native error message", (errcode, code) => {
  const failure = sqlFailure(
    { code: "ERR_SQLITE_ERROR", errcode, message: "SYNTHETIC PRIVATE" },
    "readStore",
  );
  expect(failure.code).toBe(code);
  expect(JSON.stringify(failure)).not.toContain("SYNTHETIC PRIVATE");
});

it("retains only complete numeric coordinates from our boundary stack", () => {
  const previous = Object.getOwnPropertyDescriptor(Error, "prepareStackTrace");
  Object.defineProperty(Error, "prepareStackTrace", {
    configurable: true,
    value: () =>
      "own:90:12 ignored\n at /synthetic/file.ts:12:34\n at run (/synthetic/file.ts:56:78)",
  });
  try {
    expect(sqlFailure({ code: "SQLITE_ERROR", stack: "PRIVATE:90:12" }, "writeSteps").frames).toBe(
      "at 12:34;at 56:78",
    );
  } finally {
    if (previous) Object.defineProperty(Error, "prepareStackTrace", previous);
    else Reflect.deleteProperty(Error, "prepareStackTrace");
  }
});

it.each([null, "PRIVATE_TITLE", {}, { code: "PRIVATE_TITLE" }])(
  "maps uncoded library value %s without retaining it",
  (input) => {
    expect(sqlFailure(input, "readSource")).toMatchObject({
      kind: "sqlite",
      code: "UNEXPECTED",
      statement: "readSource",
    });
  },
);

it("bounds cyclic library causes and accommodates omitted runtime stacks", () => {
  const cyclic: { cause: object } = { cause: {} };
  cyclic.cause = cyclic;
  expect(sqlFailure(cyclic, "writeSteps")).toMatchObject({
    code: "UNEXPECTED",
    statement: "writeSteps",
  });
  const previous = Object.getOwnPropertyDescriptor(Error, "prepareStackTrace");
  Error.prepareStackTrace = () => undefined;
  try {
    expect(new SqlFailure("SQLITE_ERROR", "writeSteps").frames).toBe("");
  } finally {
    if (previous) Object.defineProperty(Error, "prepareStackTrace", previous);
    else Reflect.deleteProperty(Error, "prepareStackTrace");
  }
});
