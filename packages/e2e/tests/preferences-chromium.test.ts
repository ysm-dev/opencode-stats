import { chromium } from "playwright";
import { testSettings } from "./testing/settings.ts";

testSettings(chromium, "Chromium");
