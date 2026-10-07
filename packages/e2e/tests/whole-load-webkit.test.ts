import { webkit } from "playwright";
import { testWholePaintLoads } from "./testing/whole-tour-tests.ts";

testWholePaintLoads(webkit, "WebKit");
