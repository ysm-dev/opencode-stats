import { fileURLToPath } from "node:url";

export const dashboardFiles = fileURLToPath(
  new URL("../../../.release/package/dashboard/", import.meta.url),
);
