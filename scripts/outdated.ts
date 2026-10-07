import { globSync, readFileSync } from "node:fs";
import process from "node:process";
import { gt, minVersion, prerelease, rcompare, satisfies, valid, validRange } from "semver";
import holds from "../dependency-holds.json" with { type: "json" };
import { narrowJson, object, readJson, text, type Json } from "./json.ts";

const registry = (process.env["npm_config_registry"] ?? "https://registry.npmjs.org").replace(
  /\/$/u,
  "",
);
const github = (process.env["GITHUB_API_URL"] ?? "https://api.github.com").replace(/\/$/u, "");
const cache = new Map<string, Promise<Json>>();
const failures: string[] = [];

const metadata = (url: string): Promise<Json> => {
  const existing = cache.get(url);
  if (existing) return existing;
  const headers: Record<string, string> = {};
  const token = process.env["GITHUB_TOKEN"];
  if (url.startsWith(`${github}/`) && token) headers["Authorization"] = `Bearer ${token}`;
  const result = fetch(url, { headers, signal: AbortSignal.timeout(15000) }).then(
    async (response) => {
      if (!response.ok) throw new Error(`Metadata request failed: ${response.status} ${url}`);
      return narrowJson(await response.json());
    },
  );
  cache.set(url, result);
  return result;
};

const oldEnough = (date: Json | undefined): boolean => {
  const timestamp = Date.parse(text(date));
  if (!Number.isFinite(timestamp)) throw new Error("Invalid release date");
  return Date.now() - timestamp > 7 * 86400000;
};

const held = (name: string, version: string): boolean => {
  const hold = holds.find((entry) => entry.package === name);
  if (!hold) return false;
  if (!hold.reason.trim() || !validRange(hold.allowedVersions))
    throw new Error(`${name}: invalid hold`);
  if (!satisfies(version, hold.allowedVersions, { includePrerelease: true })) {
    failures.push(`${name}: ${version} outside hold ${hold.allowedVersions}`);
  }
  return true;
};

const npmDependency = async (name: string, version: string, file: string): Promise<void> => {
  if (version.startsWith("workspace:")) return;
  if (!valid(version)) throw new Error(`${file}: ${name} must have an exact version`);
  if (held(name, version)) return;
  const data = object(await metadata(`${registry}/${encodeURIComponent(name)}`));
  const latest = text(object(data["dist-tags"])["latest"]);
  if (!valid(latest)) throw new Error(`${name}: invalid latest version`);
  const dates = object(data["time"]);
  if (!dates[version]) throw new Error(`${name}: pinned version missing from registry`);
  oldEnough(dates[version]);
  oldEnough(dates[latest]);
  const mature = Object.keys(dates)
    .filter(
      (candidate) =>
        valid(candidate) &&
        !prerelease(candidate) &&
        !gt(candidate, latest) &&
        gt(candidate, version) &&
        oldEnough(dates[candidate]),
    )
    .toSorted(rcompare)[0];
  if (mature)
    failures.push(`${file}: ${name} ${version} < ${mature}, released more than 7 days ago`);
};

const packageDependencies = async (file: string): Promise<void> => {
  const manifest = object(readJson(file));
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    await Promise.all(
      Object.entries(object(dependencies)).map(([name, version]) =>
        npmDependency(name, text(version), file),
      ),
    );
  }
  const engines = manifest["devEngines"];
  if (engines === undefined) return;
  const manager = object(engines)["packageManager"];
  if (manager !== undefined && object(manager)["name"] === "bun") {
    await npmDependency("bun", text(object(manager)["version"]), file);
  }
};

const actionDependency = async (name: string, version: string, file: string): Promise<void> => {
  if (!validRange(version))
    throw new Error(`${file}: cannot verify Action ref ${name}@${version}; use a release tag`);
  const current = minVersion(version);
  if (!current) throw new Error(`${name}: invalid Action version`);
  if (held(name, current.version)) return;
  const data = await metadata(`${github}/repos/${name}/releases?per_page=100`);
  if (!Array.isArray(data) || !data.length) throw new Error(`${name}: missing Action releases`);
  const releases = data
    .map(object)
    .filter((release) => release["draft"] === false && release["prerelease"] === false);
  if (!releases.length) throw new Error(`${name}: no stable Action releases`);
  const mature = releases
    .flatMap((release) => {
      const tag = text(release["tag_name"]);
      const candidate = valid(tag);
      if (!candidate || !oldEnough(release["published_at"])) return [];
      return [candidate];
    })
    .toSorted(rcompare)[0];
  if (mature && !satisfies(mature, version) && gt(mature, current)) {
    failures.push(`${file}: ${name}@${version} < ${mature}, released more than 7 days ago`);
  }
};

try {
  const manifests = globSync("**/package.json", {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.release/**", "**/.dev/**"],
  });
  if (!manifests.length) throw new Error("No package manifests found");
  await Promise.all(manifests.map(packageDependencies));
  for (const file of globSync(".github/**/*.{yml,yaml}")) {
    const pattern = /^\s*(?:-\s*)?uses:\s*["']?([\w.-]+\/[\w.-]+)(?:\/[\w./-]+)?@([^\s"'#]+)/gmu;
    const actions = [...readFileSync(file, "utf8").matchAll(pattern)];
    await Promise.all(
      actions.map((match) => actionDependency(match[1] ?? "", match[2] ?? "", file)),
    );
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : "Invalid dependency metadata");
}
for (const failure of failures) process.stderr.write(`ERROR ${failure}\n`);
if (failures.length) process.exitCode = 1;
else process.stdout.write("Dependencies are fresh or held (7-day grace period).\n");
