import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: "generated-src",
      spa: { enabled: true },
      router: {
        routeTreeFileHeader: [],
        addExtensions: true,
        quoteStyle: "double",
        semicolons: true,
        codeSplittingOptions: { defaultBehavior: [] },
      },
    }),
    solid({ ssr: true }),
  ],
});
