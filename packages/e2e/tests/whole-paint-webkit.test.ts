import { webkit } from "playwright";
import { testWholePaintTour } from "./testing/whole-tour-tests.ts";

testWholePaintTour(webkit, "WebKit");
