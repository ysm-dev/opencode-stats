import { RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { getRouter } from "./router.tsx";

const root = document.getElementById("app");
if (!root) throw new Error("Missing app root");

const router = getRouter();
render(() => <RouterProvider router={router} />, root);
