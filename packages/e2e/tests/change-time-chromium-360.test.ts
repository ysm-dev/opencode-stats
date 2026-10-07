import { chromium } from "playwright";
import { testCleanChangeTimeTour } from "./testing/whole-tour-tests.ts";

testCleanChangeTimeTour(chromium, "Chromium", 360);
