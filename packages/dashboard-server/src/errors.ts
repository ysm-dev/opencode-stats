export type ServerFailure = {
  readonly kind: "io" | "server";
  readonly code: string;
  readonly statement: "startup";
  readonly frames: string;
};

// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: native errors become fixed diagnostics, never library text or causes
export function serverFailure(input: unknown): ServerFailure {
  const code =
    typeof input === "object" && input !== null
      ? (["EACCES", "ENOSPC", "EADDRINUSE", "ENOENT", "BIND_FAILED"].find(
          (candidate) => Object.getOwnPropertyDescriptor(input, "code")?.value === candidate,
        ) ?? "UNEXPECTED")
      : "UNEXPECTED";
  // Capture our boundary's stack, not the library's stack (which can repeat private messages).
  const stack = new Error().stack;
  const frames = (stack ? [...stack.matchAll(/:(\d+):(\d+)\)?$/gmu)] : [])
    .map((match) => `at ${match[1]}:${match[2]}`)
    .join(";");
  return { kind: code === "UNEXPECTED" ? "server" : "io", code, statement: "startup", frames };
}
export class ServerProblem extends Error {}
