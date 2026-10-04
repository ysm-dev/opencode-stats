import { render } from "solid-js/web";
import { Dashboard } from "./dashboard.tsx";

await document.fonts.load("440 13px Inter");
render(Dashboard, document.getElementById("root")!);
