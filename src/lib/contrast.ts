/**
 * Colour parsing and WCAG contrast, for the tests that hold the palette to AA.
 *
 * Reads the three notations the theme and email files use — `hsl()`,
 * `oklch()` and hex — and blends translucent colours over what they sit on,
 * which is how a tinted badge is actually drawn.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

function parseAlpha(a: string | undefined): number {
  if (a === undefined) return 1;
  return a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) =>
    l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function linearToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function parse(value: string): Rgba {
  const v = value.trim();
  let m =
    /^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(
      v,
    );
  if (m) {
    const [r, g, b] = hslToRgb(+m[1]!, +m[2]! / 100, +m[3]! / 100);
    return { r, g, b, a: parseAlpha(m[4]) };
  }
  m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const [r, g, b] = oklchToRgb(+m[1]!, +m[2]!, +m[3]!);
    return { r, g, b, a: parseAlpha(m[4]) };
  }
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
  }
  throw new Error(`Cannot parse colour "${value}"`);
}

export function over(top: Rgba, under: Rgba, alpha = top.a): Rgba {
  return {
    r: top.r * alpha + under.r * (1 - alpha),
    g: top.g * alpha + under.g * (1 - alpha),
    b: top.b * alpha + under.b * (1 - alpha),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}
