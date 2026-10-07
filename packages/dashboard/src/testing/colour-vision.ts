type Lab = [number, number, number];
const radians = Math.PI / 180;
const matrices = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  // Machado et al. (2009), full-severity linear-sRGB transforms.
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
];
const lab = (hex: string, matrix: number[][]): Lab => {
  const rgb = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = matrix.map((row) =>
    Math.max(
      0,
      Math.min(
        1,
        row.reduce((sum, value, index) => sum + value * rgb[index]!, 0),
      ),
    ),
  );
  const xyz = [
    (0.4124564 * r! + 0.3575761 * g! + 0.1804375 * b!) / 0.95047,
    0.2126729 * r! + 0.7151522 * g! + 0.072175 * b!,
    (0.0193339 * r! + 0.119192 * g! + 0.9503041 * b!) / 1.08883,
  ].map((value) =>
    value > (6 / 29) ** 3 ? Math.cbrt(value) : value / (3 * (6 / 29) ** 2) + 4 / 29,
  );
  return [116 * xyz[1]! - 16, 500 * (xyz[0]! - xyz[1]!), 200 * (xyz[1]! - xyz[2]!)];
};
const hue = (a: number, b: number) => (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI);
const hueChange = (a: number, b: number, product: number) => {
  if (!product) return 0;
  const difference = b - a;
  if (Math.abs(difference) <= Math.PI) return difference;
  return difference + (difference > Math.PI ? -2 : 2) * Math.PI;
};
const hueMean = (a: number, b: number, product: number) => {
  if (!product) return a + b;
  if (Math.abs(a - b) <= Math.PI) return (a + b) / 2;
  return (a + b) / 2 + (a + b < 2 * Math.PI ? 1 : -1) * Math.PI;
};
// CIEDE2000, kL=kC=kH=1; independently checked against Sharma's reference pair.
export const deltaE = ([l1, a1, b1]: Lab, [l2, a2, b2]: Lab) => {
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const adjustment = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const firstA = (1 + adjustment) * a1;
  const secondA = (1 + adjustment) * a2;
  const c1 = Math.hypot(firstA, b1);
  const c2 = Math.hypot(secondA, b2);
  const h1 = hue(firstA, b1);
  const h2 = hue(secondA, b2);
  const meanL = (l1 + l2) / 2;
  const meanChroma = (c1 + c2) / 2;
  const meanHue = hueMean(h1, h2, c1 * c2);
  const t =
    1 -
    0.17 * Math.cos(meanHue - 30 * radians) +
    0.24 * Math.cos(2 * meanHue) +
    0.32 * Math.cos(3 * meanHue + 6 * radians) -
    0.2 * Math.cos(4 * meanHue - 63 * radians);
  const light = (l2 - l1) / (1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2));
  const chroma = (c2 - c1) / (1 + 0.045 * meanChroma);
  const colour =
    (2 * Math.sqrt(c1 * c2) * Math.sin(hueChange(h1, h2, c1 * c2) / 2)) /
    (1 + 0.015 * meanChroma * t);
  const rotation =
    -2 *
    Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)) *
    Math.sin(60 * radians * Math.exp(-(((meanHue / radians - 275) / 25) ** 2)));
  return Math.sqrt(light ** 2 + chroma ** 2 + colour ** 2 + rotation * chroma * colour);
};
export const visionDistances = (a: string, b: string) =>
  matrices.map((matrix) => deltaE(lab(a, matrix), lab(b, matrix)));
