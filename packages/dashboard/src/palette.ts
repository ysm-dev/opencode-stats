import { oc2Theme } from "@opencode/ui/theme/default-themes";
import { resolveThemeVariantV2 } from "@opencode/ui/theme/v2/resolve";
import type { DesktopTheme } from "@opencode/ui/theme";
import { channels, colourDistance, contrast, luminance, opaque, tokenColour } from "./colour.ts";

const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];

const nearest = (
  tokens: Record<string, string>,
  original: string,
  hue: string,
  background: string,
  minimum: number,
) => {
  const colour = tokenColour(tokens, original);
  if (contrast(colour, background) >= minimum) return colour;
  const step = /^var\(--v2-\w+-(\d+)\)$/.exec(tokens[original]!);
  const target = step ? Number(step[1]) : undefined;
  const candidates = steps
    .map((number) => ({ number, colour: tokens[`v2-${hue}-${number}`] }))
    .filter((candidate) => candidate.colour && contrast(candidate.colour, background) >= minimum);
  candidates.sort((a, b) => {
    const distance =
      target === undefined
        ? colourDistance(a.colour!, opaque(colour, background)) -
          colourDistance(b.colour!, opaque(colour, background))
        : Math.abs(a.number - target) - Math.abs(b.number - target);
    return distance || contrast(b.colour!, background) - contrast(a.colour!, background);
  });
  return candidates[0]?.colour;
};

export const dashboardPalette = (theme: DesktopTheme, dark: boolean): Record<string, string> => {
  const tokens = resolveThemeVariantV2(dark ? theme.dark : theme.light, dark);
  const palette: Record<string, string> = {};
  for (const surface of ["base", "deep", "layer-01", "layer-02", "layer-03"]) {
    const background = tokenColour(tokens, `v2-background-bg-${surface}`);
    palette[surface] = background;
    palette[`text-${surface}`] = nearest(tokens, "v2-text-text-base", "grey", background, 4.5)!;
    palette[`muted-${surface}`] =
      nearest(tokens, "v2-text-text-muted", "grey", background, 4.5) ??
      // ADR 0015: Everforest/Solarized light raised surfaces have no passing grey.
      palette[`text-${surface}`]!;
    palette[`warning-${surface}`] = nearest(
      tokens,
      "v2-state-fg-warning",
      "yellow",
      background,
      4.5,
    )!;
    palette[`focus-${surface}`] = nearest(tokens, "v2-border-border-focus", "blue", background, 3)!;
    palette[`edge-${surface}`] = nearest(tokens, "v2-border-border-strong", "grey", background, 3)!;
    palette[`selected-${surface}`] = nearest(tokens, "v2-icon-icon-accent", "blue", background, 3)!;
  }
  palette["inverse-text"] = tokenColour(tokens, "v2-text-text-inverse");
  // ADR 0015: retain inverse text, darken eighteen light inverse surfaces by one/two steps.
  palette["inverse"] = nearest(
    tokens,
    "v2-background-bg-inverse",
    "grey",
    palette["inverse-text"],
    4.5,
  )!;
  palette["empty"] = palette[dark ? "layer-01" : "layer-02"]!;
  const levels = steps
    .map((step) => tokens[`v2-blue-${step}`])
    .filter(
      (colour): colour is string =>
        !!colour &&
        contrast(colour, palette["base"]!) >= 3 &&
        contrast(colour, palette["empty"]!) >= 3,
    )
    .toSorted((a, b) =>
      dark
        ? luminance(channels(a)) - luminance(channels(b))
        : luminance(channels(b)) - luminance(channels(a)),
    );
  for (let index = 0; index < 4; index++)
    palette[`level-${index + 1}`] = levels[Math.round((index * (levels.length - 1)) / 3)]!;
  const fixed = resolveThemeVariantV2(dark ? oc2Theme.dark : oc2Theme.light, dark);
  const hues = ["blue", "orange", "purple", "green", "pink", "yellow", "cyan", "grey"];
  for (const [index, hue] of hues.entries()) {
    const step = dark ? 400 : ({ orange: 800, green: 800, yellow: 900, grey: 600 }[hue] ?? 700);
    fixed["original"] = `var(--v2-${hue}-${step})`;
    palette[`series-${index + 1}`] = nearest(fixed, "original", hue, palette["base"]!, 3)!;
  }
  for (const [index, kind] of [
    "input",
    "cache-read",
    "cache-write",
    "output",
    "reasoning",
  ].entries())
    palette[`kind-${kind}`] = palette[`series-${index + 1}`]!;
  for (const [index, outcome] of ["succeeded", "failed", "stopped"].entries())
    palette[`outcome-${outcome}`] = palette[`series-${[4, 5, 8][index]}`]!;
  return palette;
};
