import { webkit } from "playwright";
import { testCleanChangeTimeTour } from "./testing/whole-tour-tests.ts";

testCleanChangeTimeTour(webkit, "WebKit");
