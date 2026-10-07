import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { bunServer } from "./http.bun.ts";
import { processProgram } from "./main.ts";
import { bunRuntime } from "@opencode-stats/stats-store/bun";
import { bunLock } from "./lock.bun.ts";

BunRuntime.runMain(processProgram(process.argv.slice(2), bunServer, bunRuntime, bunLock));
