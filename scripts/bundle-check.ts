import { builtinModules } from "node:module";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { object, readJson, text } from "./json.ts";
import type { Json } from "./json.ts";

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "bun",
  "bun:sqlite",
  "bun:ffi",
  "bun:jsc",
  "bun:test",
  "bun:bundle",
  "bun:wrap",
]);

const imports = (value: Json | undefined): Json[] => {
  if (!Array.isArray(value)) throw new Error("Missing metafile imports");
  return value;
};

const checkImport = (value: Json): void => {
  const path = text(object(value)["path"]);
  if (!builtins.has(path)) throw new Error(`Forbidden external import: ${path}`);
};

const emittedInputs = (
  inputs: ReturnType<typeof object>,
  outputs: ReturnType<typeof object>,
): Set<string> => {
  const emitted = new Set<string>();
  const accounted = new Set<string>();
  for (const output of Object.values(outputs)) {
    const contributions = object(object(output)["inputs"]);
    for (const [name, contribution] of Object.entries(contributions)) {
      if (!Object.hasOwn(inputs, name)) throw new Error("Unknown input contribution");
      const bytes = object(contribution)["bytesInOutput"];
      if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0)
        throw new Error("Invalid input contribution");
      accounted.add(name);
      if (bytes > 0) emitted.add(name);
    }
    // A side-effect-only external import is still visible here, even if its
    // originating barrel has zero bytes in the output.
    imports(object(output)["imports"]).forEach(checkImport);
  }
  if (Object.keys(inputs).some((name) => !accounted.has(name)))
    throw new Error("Missing input contribution");
  return emitted;
};

const check = (file: string): void => {
  const meta = object(readJson(file));
  const inputs = object(meta["inputs"]);
  const outputs = object(meta["outputs"]);
  if (!Object.keys(inputs).length || !Object.keys(outputs).length)
    throw new Error("Empty metafile");
  if (
    /\/(?:bin|server)\.json$/u.test(file) &&
    Object.keys(inputs).some((path) =>
      /(?:^|[/\\])(?:effect(?:@|[/\\])|@effect[/\\]|drizzle-orm(?:@|[/\\])|sqlite(?:[/\\]|\.))/u.test(
        path,
      ),
    )
  ) {
    throw new Error("Host bundle contains Effect, SQLite or drizzle");
  }
  if (
    /\/(?:bin|server)\.json$/u.test(file) &&
    Object.values(outputs).some((output) =>
      imports(object(output)["imports"]).some((entry) =>
        ["bun:sqlite", "node:sqlite"].includes(text(object(entry)["path"])),
      ),
    )
  )
    throw new Error("Host bundle contains Effect, SQLite or drizzle");
  const emitted = emittedInputs(inputs, outputs);
  for (const [name, input] of Object.entries(inputs)) {
    // Bun marks unused Drizzle barrel imports external; a zero-byte barrel
    // contains no runtime imports. Never skip emitted inputs or output imports.
    if (!emitted.has(name)) continue;
    imports(object(input)["imports"])
      .filter((entry) => object(entry)["external"] === true)
      .forEach(checkImport);
  }
};

const folder = resolve(process.argv[2] ?? ".release/metafiles");
const files = readdirSync(folder).filter((file) => file.endsWith(".json"));
if (
  !files.includes("bin.json") ||
  !files.includes("server.json") ||
  !files.includes("process.json") ||
  !files.includes("sync-worker.json")
)
  throw new Error("Missing bundle metafiles");
for (const file of files) check(`${folder}/${file}`);
process.stdout.write("Bundle imports checked.\n");
