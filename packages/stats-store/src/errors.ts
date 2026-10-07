import * as Cause from "effect/Cause";

export type Statement = "readSource" | "writeSteps" | "readStore";
const codes = [
  "SQLITE_ERROR",
  "SQLITE_BUSY",
  "SQLITE_FULL",
  "SQLITE_READONLY",
  "SQLITE_CORRUPT",
  "SQLITE_NOTADB",
  "SQLITE_CANTOPEN",
  "SQLITE_CONSTRAINT",
  "SQLITE_IOERR",
] as const;

export class SqlFailure extends Error {
  readonly kind = "sqlite";
  readonly frames: string;
  readonly code: (typeof codes)[number] | "UNEXPECTED";
  readonly statement: Statement;
  constructor(code: (typeof codes)[number] | "UNEXPECTED", statement: Statement) {
    super("Stats store build failed.");
    this.code = code;
    this.statement = statement;
    // Only our safe error's stack is read, and only numeric frame coordinates leave this boundary.
    const stack = this.stack;
    this.frames = (stack ? [...stack.matchAll(/:(\d+):(\d+)\)?$/gmu)] : [])
      .map((match) => `at ${match[1]}:${match[2]}`)
      .join(";");
  }
}

export function sqlFailure(
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: Drizzle/Effect/native SQLite errors become fixed fields before leaving stats-store
  input: unknown,
  statement: Statement,
  seen = new WeakSet<object>(),
): SqlFailure {
  if (input instanceof SqlFailure) return input;
  if (typeof input !== "object" || input === null || seen.has(input))
    return new SqlFailure("UNEXPECTED", statement);
  seen.add(input);
  if (Cause.isCause(input)) return sqlFailure(Cause.squash(input), statement, seen);
  // node:sqlite uses ERR_SQLITE_ERROR; the numeric code carries the real SQLite failure.
  if (Object.getOwnPropertyDescriptor(input, "errcode")?.value === 8)
    return new SqlFailure("SQLITE_READONLY", statement);
  if (Object.getOwnPropertyDescriptor(input, "errcode")?.value === 11)
    return new SqlFailure("SQLITE_CORRUPT", statement);
  if (Object.getOwnPropertyDescriptor(input, "errcode")?.value === 26)
    return new SqlFailure("SQLITE_NOTADB", statement);
  for (const code of codes)
    if (
      Object.getOwnPropertyDescriptor(input, "code")?.value === code ||
      Object.getOwnPropertyDescriptor(input, "code")?.value === `ERR_${code}`
    )
      return new SqlFailure(code, statement);
  return sqlFailure(Object.getOwnPropertyDescriptor(input, "cause")?.value, statement, seen);
}
