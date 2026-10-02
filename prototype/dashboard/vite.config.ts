// PROTOTYPE, throw me away. A plain Vite SPA: the question is what the dashboard looks like,
// not how TanStack Start serves it.
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [tailwind(), solid()],
});
