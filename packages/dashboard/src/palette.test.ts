// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_THEMES, oc2Theme, resolveThemeVariantV2 } from "@opencode/ui/theme";
import { dashboardPalette } from "./palette.ts";
import { deltaE, visionDistances } from "./testing/colour-vision.ts";
import type { V2ColorValue } from "@opencode/ui/theme";

// Independent WCAG reference: encoded-sRGB compositing, then unrounded luminance.
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
};
const ratio = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
};
const resolve = (tokens: Record<string, string>, name: string): string => {
  const value = tokens[name]!;
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  return reference ? resolve(tokens, reference[1]!) : value;
};

describe("dashboard colours on the real published surfaces", () => {
  it("keeps passing OpenCode colours and repairs the documented light roles to their nearest passing values", () => {
    const light = dashboardPalette(oc2Theme, false);
    const dark = dashboardPalette(oc2Theme, true);
    expect(light["text-base"]).toBe("#161616ff");
    expect(light["muted-base"]).toBe("#5c5c5cff");
    expect(light["focus-base"]).toBe("#3b5cf6ff");
    expect(light["edge-base"]).toBe("#808080ff");
    expect(light["warning-layer-03"]).toBe("#68552bff");
    expect(dark["focus-base"]).toBe("#7698fdff");
    expect(Array.from({ length: 8 }, (_, index) => light[`series-${index + 1}`])).toEqual([
      "#0b34f4ff",
      "#d16427ff",
      "#623be2ff",
      "#198b43ff",
      "#e4429eff",
      "#ac8833ff",
      "#0096b8ff",
      "#808080ff",
    ]);
  });
  it("repairs inverse foregrounds first and preserves the exact named light fallback policies", () => {
    const preserved: Record<string, string> = {
      aura: "#756f85",
      matrix: "#6a7669",
      palenight: "#7f727a",
      tokyonight: "#6b738c",
    };
    for (const [id, background] of Object.entries(preserved)) {
      const palette = dashboardPalette(DEFAULT_THEMES[id]!, false);
      expect(palette["inverse"]).toBe(background);
      expect(palette["inverse-text"]).toBe("#ffffffff");
    }
    const fallbacks: string[] = [];
    const originals: Array<[string, string]> = [];
    const mutedFallbacks: string[] = [];
    const baseText: Array<[string, string]> = [];
    const variants = Object.entries(DEFAULT_THEMES).flatMap(([id, theme]) =>
      [false, true].map((dark) => ({ id, theme, dark })),
    );
    for (const { id, theme, dark } of variants) {
      const tokens = resolveThemeVariantV2(dark ? theme.dark : theme.light, dark);
      const palette = dashboardPalette(theme, dark);
      const scheme = dark ? "dark" : "light";
      const background = resolve(tokens, "v2-background-bg-inverse");
      if (palette["inverse"] !== background) {
        const step = Object.entries(tokens).find(
          ([key, colour]) => key.startsWith("v2-grey-") && colour === palette["inverse"],
        )?.[0];
        fallbacks.push(`${id}/${scheme}:${step}`);
        // The pinned originals are grey-1000: 1100/1200 means one/two darker steps.
        originals.push(
          [background, tokens["v2-grey-1000"]!],
          [palette["inverse-text"]!, resolve(tokens, "v2-text-text-inverse")],
        );
      }
      for (const surface of ["base", "deep", "layer-01", "layer-02", "layer-03"]) {
        const colour = palette[`muted-${surface}`]!;
        if (
          colour !== resolve(tokens, "v2-text-text-muted") &&
          !Object.entries(tokens).some(
            ([key, value]) => key.startsWith("v2-grey-") && value === colour,
          )
        ) {
          mutedFallbacks.push(`${id}/${scheme}/${surface}:${colour}`);
          baseText.push([colour, palette[`text-${surface}`]!]);
        }
      }
    }
    expect(fallbacks).toEqual([
      "ayu/light:v2-grey-1200",
      "catppuccin/light:v2-grey-1100",
      "catppuccin-frappe/light:v2-grey-1100",
      "catppuccin-macchiato/light:v2-grey-1100",
      "cobalt2/light:v2-grey-1100",
      "everforest/light:v2-grey-1200",
      "gruvbox/light:v2-grey-1100",
      "kanagawa/light:v2-grey-1100",
      "material/light:v2-grey-1100",
      "mercury/light:v2-grey-1100",
      "nightowl/light:v2-grey-1100",
      "nord/light:v2-grey-1100",
      "one-dark/light:v2-grey-1100",
      "onedarkpro/light:v2-grey-1100",
      "rosepine/light:v2-grey-1200",
      "shadesofpurple/light:v2-grey-1100",
      "solarized/light:v2-grey-1200",
      "zenburn/light:v2-grey-1100",
    ]);
    for (const [actual, original] of originals) expect(actual).toBe(original);
    expect(mutedFallbacks).toEqual([
      "everforest/light/layer-02:#334048",
      "everforest/light/layer-03:#334048",
      "solarized/light/layer-01:#2e444b",
      "solarized/light/layer-02:#2e444b",
      "solarized/light/layer-03:#2e444b",
    ]);
    for (const [muted, text] of baseText) expect(muted).toBe(text);
  });
  it("uses an independently checked CIEDE2000 reference", () => {
    expect(deltaE([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    for (const distance of visionDistances("#000000", "#ffffff"))
      expect(distance).toBeCloseTo(100, 3);
  });
  it("chooses the stronger contrast when two equally near numbered steps pass", () => {
    const palette = dashboardPalette(
      {
        ...oc2Theme,
        light: {
          ...oc2Theme.light,
          v2Overrides: {
            ...oc2Theme.light.v2Overrides,
            "v2-background-bg-base": "#767676",
            "v2-state-fg-warning": "var(--v2-yellow-600)",
            "v2-yellow-600": "#767676",
            "v2-yellow-500": "#ffffff",
            "v2-yellow-700": "#000000",
          },
        },
      },
      false,
    );
    expect(palette["warning-base"]).toBe("#000000");
  });
  it("repairs muted text within grey rather than using base text when a grey step passes", () => {
    const theme = {
      ...oc2Theme,
      light: {
        ...oc2Theme.light,
        v2Overrides: { ...oc2Theme.light.v2Overrides, "v2-text-text-muted": "#dddddd" as const },
      },
    };
    const palette = dashboardPalette(theme, false);
    expect(palette["muted-base"]).toBe("#5c5c5cff");
    expect(palette["text-base"]).toBe("#161616ff");
  });
  it("preserves the exact sRGB transfer breakpoint and an original at the AA threshold", () => {
    const atBreakpoint = dashboardPalette(
      {
        ...oc2Theme,
        light: {
          ...oc2Theme.light,
          v2Overrides: {
            ...oc2Theme.light.v2Overrides,
            "v2-background-bg-base":
              "rgba(120.37622508966662,120.37622508966662,120.37622508966662,1)",
            "v2-state-fg-warning": "rgba(10.31475,10.31475,10.31475,1)",
          },
        },
      },
      false,
    );
    expect(atBreakpoint["warning-base"]).toBe("rgba(10.31475,10.31475,10.31475,1)");
    const atThreshold = dashboardPalette(
      {
        ...oc2Theme,
        light: {
          ...oc2Theme.light,
          v2Overrides: {
            ...oc2Theme.light.v2Overrides,
            "v2-background-bg-base": "#757575",
            "v2-state-fg-warning": "rgba(0,0,0,0.9819255929730968)",
          },
        },
      },
      false,
    );
    expect(atThreshold["warning-base"]).toBe("rgba(0,0,0,0.9819255929730968)");
  });
  it("chooses a perceptually near passing grey-ramp colour in a tinted palette, not an unrelated hue", () => {
    const greys: Record<string, V2ColorValue> = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`v2-grey-${(index + 1) * 100}`, "#000000"]),
    );
    const palette = dashboardPalette(
      {
        ...oc2Theme,
        light: {
          ...oc2Theme.light,
          v2Overrides: {
            ...oc2Theme.light.v2Overrides,
            ...greys,
            "v2-text-text-muted": "#c0b0e0",
            "v2-grey-700": "#776699",
            "v2-grey-800": "#807060",
          },
        },
      },
      false,
    );
    expect(palette["muted-base"]).toBe("#776699");
  });
  it.each([
    { original: "#b7f4d7", candidates: ["#661b3e", "#462c45"], expected: "#661b3e" },
    { original: "#cacd99", candidates: ["#304742", "#7a1163"], expected: "#304742" },
    { original: "#e8a2a4", candidates: ["#480ba1", "#565991"], expected: "#565991" },
  ])(
    "takes the nearest passing tone to $original, accounting for hue, chroma and lightness",
    ({ original, candidates, expected }) => {
      const greys: Record<string, V2ColorValue> = Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`v2-grey-${(index + 1) * 100}`, "#000000"]),
      );
      const overrides: Record<string, V2ColorValue> = {
        ...oc2Theme.light.v2Overrides,
        ...greys,
        "v2-text-text-muted": `#${original.slice(1)}`,
        "v2-grey-700": `#${candidates[0]!.slice(1)}`,
        "v2-grey-800": `#${candidates[1]!.slice(1)}`,
      };
      const palette = dashboardPalette(
        { ...oc2Theme, light: { ...oc2Theme.light, v2Overrides: overrides } },
        false,
      );
      expect(palette["muted-base"]).toBe(expected);
      expect(ratio(expected, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    },
  );
  it("requires graph marks to contrast with the chart surface as well as empty days", () => {
    const theme = {
      ...oc2Theme,
      light: {
        ...oc2Theme.light,
        v2Overrides: {
          ...oc2Theme.light.v2Overrides,
          "v2-background-bg-base": "#000000" as const,
          "v2-background-bg-layer-02": "#ffffff" as const,
          "v2-blue-300": "#808080" as const,
          "v2-blue-400": "#858585" as const,
          "v2-blue-500": "#8a8a8a" as const,
          "v2-blue-600": "#909090" as const,
        },
      },
    };
    const palette = dashboardPalette(theme, false);
    for (const level of [1, 2, 3, 4]) {
      expect(ratio(palette[`level-${level}`]!, "#000000")).toBeGreaterThanOrEqual(3);
      expect(ratio(palette[`level-${level}`]!, "#ffffff")).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(palette["text-base"]!, "#000000")).toBeGreaterThanOrEqual(4.5);
  });
  it("orders the four graph levels by actual luminance even when numbered steps run in the opposite direction", () => {
    const blue: Record<string, V2ColorValue> = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const byte = ((index + 1) * 8).toString(16).padStart(2, "0");
        return [`v2-blue-${(index + 1) * 100}`, `#${byte.repeat(3)}`];
      }),
    );
    const palette = dashboardPalette(
      {
        ...oc2Theme,
        light: { ...oc2Theme.light, v2Overrides: { ...oc2Theme.light.v2Overrides, ...blue } },
      },
      false,
    );
    const levels = [1, 2, 3, 4].map((level) => palette[`level-${level}`]!);
    expect(
      levels
        .slice(1)
        .map((colour, index) => luminance(colour) < luminance(levels[index]!))
        .every(Boolean),
    ).toBe(true);
  });
  it("includes exact unrounded AA boundary colours, not only values above the boundary", () => {
    const blue: Record<string, V2ColorValue> = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`v2-blue-${(index + 1) * 100}`, "#646464"]),
    );
    const yellow: Record<string, V2ColorValue> = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`v2-yellow-${(index + 1) * 100}`, "#757575"]),
    );
    const light = {
      ...oc2Theme.light,
      v2Overrides: {
        ...oc2Theme.light.v2Overrides,
        ...blue,
        "v2-background-bg-base": "#646464" as const,
        "v2-background-bg-layer-02": "#646464" as const,
        "v2-blue-300": "rgba(0,0,0,0.7597947939333562)" as const,
        "v2-blue-400": "#ffffff" as const,
        "v2-blue-500": "#f0f0f0" as const,
        "v2-blue-600": "#e0e0e0" as const,
      },
    };
    const palette = dashboardPalette({ ...oc2Theme, light }, false);
    expect(new Set([1, 2, 3, 4].map((level) => palette[`level-${level}`])).size).toBe(4);
    expect(Object.values(palette)).toContain("rgba(0,0,0,0.7597947939333562)");
    const warning = dashboardPalette(
      {
        ...oc2Theme,
        light: {
          ...oc2Theme.light,
          v2Overrides: {
            ...oc2Theme.light.v2Overrides,
            ...yellow,
            "v2-background-bg-base": "#757575",
            "v2-state-fg-warning": "var(--v2-yellow-600)",
            "v2-yellow-500": "rgba(0,0,0,0.9819255929730968)",
          },
        },
      },
      false,
    );
    expect(warning["warning-base"]).toBe("rgba(0,0,0,0.9819255929730968)");
  });
  it.each(
    Object.values(DEFAULT_THEMES).flatMap((theme) =>
      [false, true].map((dark) => ({ theme, dark })),
    ),
  )("$theme.name dark=$dark keeps readable text on every drawn surface", ({ theme, dark }) => {
    const tokens = resolveThemeVariantV2(dark ? theme.dark : theme.light, dark);
    const palette = dashboardPalette(theme, dark);
    for (const surface of ["base", "deep", "layer-01", "layer-02", "layer-03"]) {
      const background = resolve(tokens, `v2-background-bg-${surface}`);
      expect(ratio(palette[`text-${surface}`]!, background)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(palette[`muted-${surface}`]!, background)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(palette[`warning-${surface}`]!, background)).toBeGreaterThanOrEqual(4.5);
      for (const role of ["focus", "edge", "selected"]) {
        expect(ratio(palette[`${role}-${surface}`]!, background)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(ratio(palette["inverse-text"]!, palette["inverse"]!)).toBeGreaterThanOrEqual(4.5);
    const surface = resolve(tokens, "v2-background-bg-base");
    const roles = [
      ...Array.from({ length: 8 }, (_, index) => `series-${index + 1}`),
      ...["input", "cache-read", "cache-write", "output", "reasoning"].map(
        (kind) => `kind-${kind}`,
      ),
      ...["succeeded", "failed", "stopped"].map((outcome) => `outcome-${outcome}`),
      ...[1, 2, 3, 4].map((level) => `level-${level}`),
    ];
    for (const role of roles) {
      const colour = palette[role]!;
      expect(ratio(colour, surface)).toBeGreaterThanOrEqual(3);
    }
    const levels = [1, 2, 3, 4].map((level) => palette[`level-${level}`]!);
    expect(Object.keys(palette).filter((role) => role.startsWith("level-")).length).toBe(4);
    expect(ratio(palette["empty"]!, surface)).toBeLessThan(3);
    expect(new Set(levels).size).toBe(4);
    for (const colour of levels) {
      expect(ratio(colour, palette["empty"]!)).toBeGreaterThanOrEqual(3);
    }
    expect(
      levels
        .slice(1)
        .map((colour, index) => (luminance(colour) - luminance(levels[index]!)) * (dark ? 1 : -1))
        .every((difference) => difference > 0),
    ).toBe(true);
    const series = Array.from({ length: 8 }, (_, index) => palette[`series-${index + 1}`]!);
    const kinds = ["input", "cache-read", "cache-write", "output", "reasoning"].map(
      (kind) => palette[`kind-${kind}`]!,
    );
    for (const sequence of [series, kinds])
      for (let index = 1; index < sequence.length; index++) {
        expect(
          Math.min(...visionDistances(sequence[index - 1]!, sequence[index]!)),
          `neighbor ${index}: ${sequence[index - 1]} / ${sequence[index]}`,
        ).toBeGreaterThanOrEqual(10);
      }
  });
});
