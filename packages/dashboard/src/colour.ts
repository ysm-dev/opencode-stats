import { rgbToOklch } from "@opencode/ui/theme/color";
import defaults from "../node_modules/@opencode/ui/src/styles/tokens/colors.css?raw";

const staticTokens = () =>
  Object.fromEntries(
    [...defaults.matchAll(/--([\w-]+): (#[\da-f]+);/gi)].map((match) => [match[1]!, match[2]!]),
  );

export const channels = (colour: string) => {
  if (colour.startsWith("rgba")) return colour.match(/[\d.]+/g)!.map(Number);
  const hex = colour.slice(1);
  return [0, 2, 4]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
    .concat(hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1);
};
const composite = (foreground: string, background: string) => {
  const front = channels(foreground);
  const back = channels(background);
  return [0, 1, 2].map((index) => front[index]! * front[3]! + back[index]! * (1 - front[3]!));
};
export const luminance = (rgb: number[]) => {
  const linear = rgb.map((value) => {
    const encoded = value / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
};
export const contrast = (foreground: string, background: string) => {
  const a = luminance(composite(foreground, background));
  const b = luminance(channels(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
export const colourRank = (candidate: string, original: string, background: string) => {
  const a = composite(candidate, background);
  const b = composite(original, background);
  const first = rgbToOklch(a[0]! / 255, a[1]! / 255, a[2]! / 255);
  const second = rgbToOklch(b[0]! / 255, b[1]! / 255, b[2]! / 255);
  const angle = ((first.h - second.h) * Math.PI) / 180;
  return (first.l - second.l) ** 2 + first.c ** 2 - 2 * first.c * second.c * Math.cos(angle);
};

export const tokenColour = (tokens: Record<string, string>, name: string): string => {
  const value = tokens[name] ?? staticTokens()[name]!;
  return value.startsWith("var(--") ? tokenColour(tokens, value.slice(6, -1)) : value;
};
