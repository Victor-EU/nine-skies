/**
 * Colour arithmetic for the look, on the CPU.
 *
 * Presets are picked by eye, so they are written in sRGB; the shaders light
 * in linear, so every colour crosses here once on its way to a uniform. The
 * same two curves as `COLOR_SPACE_GLSL`, so a colour converted here and one
 * converted in the shader agree to the float.
 */
export type Rgb = readonly [number, number, number];

export function srgbToLinear(c: Rgb): [number, number, number] {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return [f(c[0]), f(c[1]), f(c[2])];
}

export function linearToSrgb(c: Rgb): [number, number, number] {
  const f = (v: number) => {
    const x = Math.max(v, 0);
    return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

export function mix(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function mul(a: Rgb, b: Rgb | number): [number, number, number] {
  if (typeof b === "number") return [a[0] * b, a[1] * b, a[2] * b];
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

export function add(a: Rgb, b: Rgb): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Rec. 709 luminance of a linear colour. */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
