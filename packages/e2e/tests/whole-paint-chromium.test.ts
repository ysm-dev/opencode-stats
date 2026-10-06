import { chromium } from "playwright";
import { testWholePaintTour } from "./testing/whole-tour-tests.ts";

testWholePaintTour(chromium, "Chromium");
