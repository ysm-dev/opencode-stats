import { fileURLToPath } from "node:url";

export const emptyConfig = fileURLToPath(new URL("./empty-bunfig.toml", import.meta.url));
