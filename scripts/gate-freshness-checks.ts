import { createServer } from "node:http";
import root from "../package.json" with { type: "json" };
import dashboard from "../packages/dashboard/package.json" with { type: "json" };
import serverPackage from "../packages/dashboard-server/package.json" with { type: "json" };
import holds from "../dependency-holds.json" with { type: "json" };
import type { Check } from "./verify-gates.ts";

export async function* freshnessChecks(): AsyncGenerator<Check> {
  let age = 8;
  let action = false;
  let broken = false;
  let bunOld = false;
  let newerYoung = false;
  const versions: Readonly<Record<string, string>> = {
    ...dashboard.dependencies,
    ...dashboard.devDependencies,
    ...serverPackage.dependencies,
    ...serverPackage.devDependencies,
    ...root.devDependencies,
    bun: root.devEngines.packageManager.version,
  };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "");
    const published = new Date(Date.now() - age * 86400000).toISOString();
    response.setHeader("Content-Type", "application/json");
    if (broken) {
      response.end("{}");
      return;
    }
    if (path.startsWith("/repos/")) {
      response.end(
        JSON.stringify([
          {
            tag_name: action ? "v99.0.0" : path.includes("setup-bun") ? "v2.2.0" : "v7.0.0",
            published_at: published,
            draft: false,
            prerelease: false,
          },
        ]),
      );
      return;
    }
    const name = path.slice(1);
    const version = name === "bun" && bunOld ? "1.4.1" : (versions[name] ?? "1.0.0");
    const latest =
      name === "gate-canary-dependency"
        ? newerYoung
          ? "3.0.0"
          : "2.0.0"
        : (versions[name] ?? version);
    response.end(
      JSON.stringify({
        "dist-tags": { latest },
        time: {
          [version]: "2020-01-01T00:00:00Z",
          "2.0.0": published,
          [latest]: newerYoung ? new Date(Date.now() - 86400000).toISOString() : published,
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Registry fixture did not bind");
  const url = `http://127.0.0.1:${address.port}`;
  const env = { npm_config_registry: url, GITHUB_API_URL: url };
  const manifest = JSON.stringify({
    ...dashboard,
    devDependencies: { ...dashboard.devDependencies, "gate-canary-dependency": "1.0.0" },
  });
  const files = { "packages/dashboard/package.json": manifest };
  try {
    yield {
      gate: "old unheld dependency rejected",
      files,
      env,
      command: ["outdated"],
      expect: ["gate-canary-dependency", "2.0.0", "7 days"],
    };
    age = 6;
    yield {
      gate: "young release has grace period",
      files,
      env,
      command: ["outdated"],
      expect: [],
      accepts: true,
    };
    age = 8;
    newerYoung = true;
    yield {
      gate: "a young latest release does not hide older stale releases",
      files,
      env,
      command: ["outdated"],
      expect: ["gate-canary-dependency", "2.0.0"],
    };
    newerYoung = false;
    bunOld = true;
    yield {
      gate: "Bun devEngines freshness",
      files: {
        "package.json": JSON.stringify({
          ...root,
          devEngines: { packageManager: { ...root.devEngines.packageManager, version: "1.4.1" } },
        }),
      },
      env,
      command: ["outdated"],
      expect: ["bun", "1.4.2", "7 days"],
    };
    bunOld = false;
    yield {
      gate: "held dependency allowed",
      files: {
        ...files,
        "dependency-holds.json": JSON.stringify([
          ...holds,
          {
            package: "gate-canary-dependency",
            allowedVersions: "1.0.0",
            reason: "Synthetic hold: lift after canary",
          },
        ]),
      },
      env,
      command: ["outdated"],
      expect: [],
      accepts: true,
    };
    yield {
      gate: "hold does not allow other versions",
      files: {
        ...files,
        "dependency-holds.json": JSON.stringify([
          ...holds,
          { package: "gate-canary-dependency", allowedVersions: "0.9.0", reason: "Synthetic hold" },
        ]),
      },
      env,
      command: ["outdated"],
      expect: ["outside hold"],
    };
    yield {
      gate: "exceptions lists the same holds",
      files: {},
      command: ["exceptions"],
      expect: ["Dependency holds:", "drizzle-orm", "solid-js", "typescript"],
      accepts: true,
    };
    action = true;
    yield {
      gate: "GitHub Actions freshness",
      files: {},
      env,
      command: ["outdated"],
      expect: ["actions/checkout", "99.0.0"],
    };
    action = false;
    const artifacts = ["dist", ".release", ".dev"].flatMap((directory) => [
      `${directory}/package.json`,
      `packages/${directory}/package.json`,
      `scripts/${directory}/package.json`,
    ]);
    yield {
      gate: "artifacts excluded from freshness",
      files: Object.fromEntries(
        artifacts.map((path) => [
          path,
          JSON.stringify({ dependencies: { "gate-canary-not-in-registry": "0.0.0" } }),
        ]),
      ),
      env,
      command: ["outdated"],
      expect: [],
      accepts: true,
    };
    broken = true;
    yield {
      gate: "registry failure is not a false pass",
      files: {},
      env,
      command: ["outdated"],
      expect: ["ERROR"],
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
