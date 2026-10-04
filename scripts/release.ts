import { build as bundle } from "bun";
import { build as dashboard } from "vite";
import { chmod, copyFile, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import manifest from "../packages/opencode-stats/package.json" with { type: "json" };
import { notices } from "./release-notices.ts";
import { narrowJson } from "./json.ts";
import type { Json } from "./json.ts";

const folder = resolve(".release");
const packed = resolve(folder, "package");
const version = manifest.version;
const metafiles: Json[] = [];
const assets: string[] = [];
await rm(folder, { recursive: true, force: true });
await mkdir(packed, { recursive: true });
await mkdir(resolve(folder, "metafiles"));

const paths = {
  [resolve("packages/opencode-stats/src/paths.ts")]:
    `import {fileURLToPath} from 'node:url'; export const version=${JSON.stringify(version)}; export const serverScript=fileURLToPath(new URL('./process.js',import.meta.url));`,
  [resolve("packages/launcher/src/paths.ts")]:
    "import {fileURLToPath} from 'node:url'; export const emptyConfig=fileURLToPath(new URL('./empty-bunfig.toml',import.meta.url));",
  [resolve("packages/dashboard-server/src/paths.ts")]:
    "import {fileURLToPath} from 'node:url'; export const dashboardFiles=fileURLToPath(new URL('./dashboard/',import.meta.url));",
  [resolve("packages/stats-store/src/paths.ts")]:
    "export const syncWorkerFile=new URL('./sync-worker.js',import.meta.url).href;",
};

for (const [name, entry] of [
  ["bin", "packages/opencode-stats/src/bin.ts"],
  ["process", "packages/dashboard-server/src/process.ts"],
  ["sync-worker", "packages/stats-store/src/sync-worker.ts"],
]) {
  if (!name || !entry) throw new Error("Missing entry");
  const result = await bundle({
    entrypoints: [entry],
    outdir: packed,
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    metafile: true,
    banner: `// opencode-stats ${version}`,
    plugins: [
      {
        name: "release-paths",
        setup(build) {
          build.onLoad({ filter: /[/\\]paths\.ts$/u }, ({ path }) => {
            const contents = paths[path];
            return contents === undefined ? undefined : { contents, loader: "ts" };
          });
        },
      },
    ],
  });
  if (!result.success || !result.metafile)
    throw new Error(`Bundling ${name} failed: ${result.logs.map((log) => log.message).join("\n")}`);
  await writeFile(
    resolve(folder, "metafiles", `${name}.json`),
    JSON.stringify(result.metafile, null, 2),
  );
  metafiles.push(narrowJson(result.metafile));
}
execFileSync(process.execPath, ["run", "scripts/bundle-check.ts"], { stdio: "inherit" });
await dashboard({
  root: "packages/dashboard",
  configFile: "packages/dashboard/vite.config.ts",
  plugins: [
    {
      name: "release-asset-licenses",
      generateBundle(_options, output) {
        for (const item of Object.values(output))
          if (item.type === "asset") assets.push(...item.originalFileNames);
      },
    },
  ],
  build: {
    outDir: resolve(packed, "dashboard"),
    emptyOutDir: true,
    minify: true,
    license: { fileName: "THIRD_PARTY_NOTICES.md" },
    rolldownOptions: {
      output: { banner: `/* opencode-stats ${version} */`, codeSplitting: false },
    },
  },
});
await copyFile("packages/launcher/src/empty-bunfig.toml", resolve(packed, "empty-bunfig.toml"));
await copyFile("README.md", resolve(packed, "README.md"));
await copyFile("LICENSE", resolve(packed, "LICENSE"));
await writeFile(
  resolve(packed, "THIRD_PARTY_NOTICES.md"),
  `# Bundled server and asset dependencies\n\n${notices(metafiles, assets)}\n## Inter\n\n${await readFile("docs/licenses/inter.txt", "utf8")}\nDashboard JavaScript dependency notices: dashboard/THIRD_PARTY_NOTICES.md.\n`,
);
await chmod(resolve(packed, "bin.js"), 0o755);
await writeFile(
  resolve(packed, "package.json"),
  JSON.stringify(
    {
      name: "opencode-stats",
      version,
      description: "A local, read-only dashboard of OpenCode usage",
      license: "MIT",
      type: "module",
      exports: { "./bin": "./bin.js" },
      bin: { "opencode-stats": "./bin.js" },
      engines: { bun: ">=1.4.2" },
      files: [
        "*.js",
        "*.js.map",
        "empty-bunfig.toml",
        "dashboard",
        "README.md",
        "LICENSE",
        "THIRD_PARTY_NOTICES.md",
      ],
      repository: {
        type: "git",
        url: "git+https://github.com/ysm-dev/opencode-stats.git",
        directory: "packages/opencode-stats",
      },
    },
    null,
    2,
  ),
);
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--ignore-scripts", "--pack-destination", folder],
  { cwd: packed, stdio: "inherit", shell: process.platform === "win32" },
);
