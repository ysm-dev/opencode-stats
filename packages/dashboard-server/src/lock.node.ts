import { DatabaseSync } from "node:sqlite";
import { lock } from "./lock.ts";

export const nodeLock = lock((file) => new DatabaseSync(file));
