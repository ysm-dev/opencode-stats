import { DEFAULT_THEMES } from "@opencode/ui/theme/default-themes";
import { resolveThemeVariant, themeToCss } from "@opencode/ui/theme/resolve";
import { resolveThemeVariantV2, themeV2ToCss } from "@opencode/ui/theme/v2/resolve";
import { tokenColour } from "./colour.ts";
import type { PrepaintData } from "./startup.ts";
// oxlint-disable-next-line import/default -- Vite's ?raw module exports the source text, not the TypeScript module's exports.
import source from "./startup.ts?raw";
import { transformWithOxc } from "vite";
import { crc32 } from "node:zlib";

export const prepaintThemes = (): PrepaintData => {
  const properties = new Set<string>();
  const references = new Set<string>();
  const themes = Object.fromEntries(
    Object.entries(DEFAULT_THEMES).map(([id, theme]) => {
      const variantFor = (dark: boolean) => {
        const variant = dark ? theme.dark : theme.light;
        const tokens = resolveThemeVariantV2(variant, dark);
        const legacy = resolveThemeVariant(variant, dark);
        const css = `${themeToCss(legacy)}\n  ${themeV2ToCss(tokens)}`;
        for (const name of [...Object.keys(legacy), ...Object.keys(tokens)]) properties.add(name);
        for (const reference of css.matchAll(/var\(--([a-z][a-z0-9-]*)\)/gi))
          references.add(reference[1]!);
        return {
          background: tokenColour(tokens, "v2-background-bg-deep"),
          fingerprint: String(crc32(css)),
        };
      };
      return [id, { light: variantFor(false), dark: variantFor(true) }];
    }),
  );
  return { themes, properties: [...properties], references: [...references] };
};

export const classicPreload = async (trusted: PrepaintData = prepaintThemes()) => {
  const compiled = await transformWithOxc(source, "startup.ts");
  return `(()=>{${compiled.code.replaceAll("export ", "")}\nstartup(${JSON.stringify(trusted)});})();`;
};
