import { hexToOklch } from "@opencode/ui/theme/color";

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
  return front
    .slice(0, 3)
    .map((value, index) => value * front[3]! + back[index]! * (1 - front[3]!));
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
  const b = luminance(channels(background).slice(0, 3));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
export const colourDistance = (a: string, b: string) => {
  const first = hexToOklch(`#${a.slice(1)}`);
  const second = hexToOklch(`#${b.slice(1)}`);
  const angle = ((first.h - second.h) * Math.PI) / 180;
  return (
    (first.l - second.l) ** 2 +
    first.c ** 2 +
    second.c ** 2 -
    2 * first.c * second.c * Math.cos(angle)
  );
};

export const opaque = (foreground: string, background: string) =>
  `#${composite(foreground, background)
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;

export const tokenColour = (tokens: Record<string, string>, name: string): string => {
  const alpha = /^v2-alpha-(dark|light)-(\d+)$/.exec(name);
  if (alpha) {
    const channel = alpha[1] === "dark" ? 0 : 255;
    return `rgba(${channel}, ${channel}, ${channel}, ${Number(alpha[2]) / 100})`;
  }
  const value = tokens[name]!;
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  return reference ? tokenColour(tokens, reference[1]!) : value;
};
