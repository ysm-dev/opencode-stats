// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: OpenCode plugin options must narrow before launching a process
export function pluginOptions(input: unknown): { port: number; db: string | undefined } {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Invalid opencode-stats options: expected an object.");
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: only integer TCP ports are accepted, never coerced
  const port: unknown = Object.getOwnPropertyDescriptor(input, "port")?.value;
  if (port !== undefined && (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535))
    throw new Error("Invalid opencode-stats port: use an integer from 1 to 65535.");
  // oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: database options must be nonempty paths, not coerced values
  const db: unknown = Object.getOwnPropertyDescriptor(input, "db")?.value;
  if (db !== undefined && (typeof db !== "string" || db.length === 0 || db.includes("\0")))
    throw new Error("Invalid opencode-stats db: use a nonempty file path.");
  return { port: Number(port ?? 22439), db };
}
