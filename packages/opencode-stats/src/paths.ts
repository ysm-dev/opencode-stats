import { fileURLToPath } from "node:url";
import manifest from "../package.json" with { type: "json" };

export const version = `${manifest.version}-dev`;
export const serverScript = fileURLToPath(
  new URL("../../dashboard-server/src/process.ts", import.meta.url),
);
