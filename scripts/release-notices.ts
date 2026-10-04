import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { object, readJson, text } from "./json.ts";
import type { Json } from "./json.ts";

const packageFolder = (file: string): string => {
  let folder = dirname(resolve(file));
  while (!existsSync(resolve(folder, "package.json"))) {
    const parent = dirname(folder);
    if (parent === folder) throw new Error(`Bundled input has no manifest: ${file}`);
    folder = parent;
  }
  return folder;
};

export const notices = (metafiles: Json[], assets: string[]): string => {
  const require = createRequire(
    resolve("packages/dashboard/node_modules/@opencode/ui/package.json"),
  );
  const assetOwners = assets
    .filter((path) => path.includes("node_modules/"))
    .map((path) => {
      const parts = path.split("node_modules/").at(-1)?.split("/") ?? [];
      const name = parts.slice(0, parts[0]?.startsWith("@") ? 2 : 1).join("/");
      return require.resolve(`${name}/package.json`);
    });
  const packages = new Set(
    [...metafiles.flatMap((meta) => Object.keys(object(object(meta)["inputs"]))), ...assetOwners]
      .filter((path) => path.includes("node_modules"))
      .map(packageFolder),
  );
  return [...packages]
    .toSorted()
    .map((folder) => {
      const manifest = object(readJson(resolve(folder, "package.json")));
      const files = readdirSync(folder).filter((file) =>
        /^(?:license|notice)(?:\.[\w-]+)?$/iu.test(file),
      );
      if (!files.length)
        throw new Error(`Bundled dependency needs license text: ${text(manifest["name"])}`);
      return `## ${text(manifest["name"])} ${text(manifest["version"])}\n\n${files.map((file) => readFileSync(resolve(folder, file), "utf8")).join("\n")}\n`;
    })
    .join("\n");
};
