#!/usr/bin/env bun
import { run } from "./main.ts";

process.exitCode = await run(process.argv.slice(2));
