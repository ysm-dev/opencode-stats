import { chromium } from "playwright";
import { testWholePaintLoads } from "./testing/whole-tour-tests.ts";

testWholePaintLoads(chromium, "Chromium");
