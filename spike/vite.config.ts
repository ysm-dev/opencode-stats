import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    tanstackStart({
      spa: { enabled: true },
      router: {
        enableRouteGeneration: false,
        codeSplittingOptions: { defaultBehavior: [] },
      },
    }),
    solid({ ssr: true }),
  ],
});
