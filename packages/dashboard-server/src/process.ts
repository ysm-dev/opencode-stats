import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { bunServer } from "./http.bun.ts";
import { program } from "./main.ts";
import { bunRuntime } from "@opencode-stats/stats-store/bun";

BunRuntime.runMain(program(process.argv.slice(2), bunServer, bunRuntime));
