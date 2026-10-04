import * as Effect from "effect/Effect";
import { bunDatabase } from "./runtime.bun.ts";
import { workerProgram } from "./worker-program.ts";

Effect.runFork(workerProgram(globalThis, bunDatabase));
