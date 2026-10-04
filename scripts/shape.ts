import { globSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";
import { object, readJson, text, type Json } from "./json.ts";

const leaves = (value: Json): readonly string[] => {
  if (typeof value === "string") return [value];
  if (value === null) return [];
  if (typeof value !== "object") throw new Error("Package entry must be a source path");
  return Object.values(value).flatMap(leaves);
};

const root = object(readJson("package.json"));
const workspaces = root["workspaces"];
if (!Array.isArray(workspaces) || workspaces.some((workspace) => typeof workspace !== "string"))
  throw new Error("Expected workspace globs");
const manifests = workspaces.flatMap((workspace) =>
  globSync(`${text(workspace)}/package.json`, {
    exclude: ["**/dist/**", "**/.release/**", "**/.dev/**", "**/node_modules/**"],
  }),
);
if (!manifests.length) throw new Error("No workspace packages found");
for (const file of manifests) {
  const manifest = object(readJson(file));
  for (const field of ["exports", "bin", "types"]) {
    const value = manifest[field];
    if (value === undefined) continue;
    const src = `${resolve(dirname(file), "src")}${sep}`;
    for (const path of leaves(value)) {
      if (!path.startsWith("./src/") || !resolve(dirname(file), path).startsWith(src)) {
        process.stderr.write(`ERROR ${file}: ${field} ${path} must point into its own src/\n`);
        process.exitCode = 1;
      }
    }
  }
}
