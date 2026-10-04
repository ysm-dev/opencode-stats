declare const Bun: { readonly version: string };

export const runtimeProblem = (): string | undefined => {
  if (typeof Bun === "undefined") return "opencode-stats needs Bun: run `bunx opencode-stats`";
  const [major = 0, minor = 0, patch = 0] = Bun.version.split(".").map(Number);
  if (major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 2)))) return undefined;
  return `opencode-stats needs Bun 1.4.2 or later (this is ${Bun.version}) · run \`bun upgrade\``;
};
