import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { object, readJson, text } from "./json.ts";
import type { Json } from "./json.ts";
const archived: Readonly<Record<string, string>> = {
  "drizzle-orm@1.0.0-rc.5-5935859": "docs/licenses/drizzle-orm.txt",
};

const packageFolder = (file: string): string => {
  // Bun 1.4.2 can prepend ../ segments to an absolute cache path on another Windows drive.
  const suffix = file.replace(/^(?:\.\.[/\\])+/u, "");
  let folder = dirname(realpathSync(isAbsolute(suffix) ? suffix : file));
  while (!existsSync(resolve(folder, "package.json"))) {
    const parent = dirname(folder);
    if (parent === folder) throw new Error(`Bundled input has no manifest: ${file}`);
    folder = parent;
  }
  return folder;
};

export const notices = (metafiles: Json[], assets: string[]): string => {
  const require = createRequire(
    realpathSync("packages/dashboard/node_modules/@opencode/ui/package.json"),
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
      const source = archived[`${text(manifest["name"])}@${text(manifest["version"])}`];
      if (!files.length && source === undefined)
        throw new Error(`Bundled dependency needs license text: ${text(manifest["name"])}`);
      const license = files.length
        ? files.map((file) => readFileSync(resolve(folder, file), "utf8")).join("\n")
        : readFileSync(resolve(source!), "utf8");
      return `## ${text(manifest["name"])} ${text(manifest["version"])}\n\n${license}\n`;
    })
    .join("\n");
};
