import { fileURLToPath } from "node:url";

export const dashboardFiles = fileURLToPath(new URL("../../../.dev/dashboard/", import.meta.url));
