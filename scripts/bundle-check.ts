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

const check = (file: string): void => {
  const meta = object(readJson(file));
  const inputs = object(meta["inputs"]);
  const outputs = object(meta["outputs"]);
  if (!Object.keys(inputs).length || !Object.keys(outputs).length)
    throw new Error("Empty metafile");
  if (
    file.endsWith("/bin.json") &&
    Object.keys(inputs).some((path) =>
      /(?:^|[/\\])(?:effect(?:@|[/\\])|@effect[/\\]|drizzle-orm(?:@|[/\\]))/u.test(path),
    )
  ) {
    throw new Error("Bin bundle contains Effect or drizzle");
  }
  for (const input of Object.values(inputs)) {
    imports(object(input)["imports"])
      .filter((entry) => object(entry)["external"] === true)
      .forEach(checkImport);
  }
  for (const output of Object.values(outputs))
    imports(object(output)["imports"]).forEach(checkImport);
};

const folder = resolve(process.argv[2] ?? ".release/metafiles");
const files = readdirSync(folder).filter((file) => file.endsWith(".json"));
if (!files.includes("bin.json") || !files.includes("process.json"))
  throw new Error("Missing bundle metafiles");
for (const file of files) check(`${folder}/${file}`);
process.stdout.write("Bundle imports checked.\n");
