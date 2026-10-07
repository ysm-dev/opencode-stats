import { fileURLToPath } from "node:url";

export const dashboardFiles = fileURLToPath(
  new URL("../../../.release/package/dashboard/", import.meta.url),
);
export const version = "0.2.0-dev";
