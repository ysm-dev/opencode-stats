import * as Effect from "effect/Effect";
import { bunDatabase, bunSource } from "./runtime.bun.ts";
import { workerProgram } from "./worker-program.ts";

Effect.runFork(Effect.scoped(workerProgram(globalThis, bunDatabase, bunSource)));
