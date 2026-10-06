import { webkit } from "playwright";
import { testSettings } from "./testing/settings.ts";

testSettings(webkit, "WebKit");
