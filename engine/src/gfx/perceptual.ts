/**
 * How different two colours look, rather than how different their numbers are.
 *
 * Needed because the questions this project asks about colour are perceptual
 * ones - does the sky change enough for a player to notice they have climbed,
 * are two elevation steps distinguishable to a colour-blind reader - and RGB
 * distance answers none of them. A 0.1 step in blue near black and the same
 * step near white are the same number and nothing like the same sight.
 *
 * CIE L*a*b* with dE76. dE2000 is more accurate for near-matches and is not
 * worth its complexity here: everything asked of this is well clear of the
 * threshold, and dE76 has the advantage that a reader can check it by hand.
 *
 * Rules of thumb it is used against: ~2.3 is a just-noticeable difference
 * under good conditions, ~10 reads as a different colour at a glance.
 */
import type { Color } from "three";

/** D65 white, the reference three's linear-sRGB working space is built on. */
const WHITE_X = 0.95047;
const WHITE_Z = 1.08883;

function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

/**
 * Linear sRGB to CIE L*a*b*.
 *
 * Linear, not sRGB-encoded, because that is what a `three` Color holds: its
 * working colour space is linear-sRGB and the transfer to the display happens
 * on the way out. Feeding this an encoded triple gives a plausible-looking
 * number that is wrong by tens of dE.
 */
export function labFromLinear(r: number, g: number, b: number): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / WHITE_X;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / WHITE_Z;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** dE76 between two linear-sRGB colours. */
export function deltaE(a: Color, b: Color): number {
  const [l1, a1, b1] = labFromLinear(a.r, a.g, a.b);
  const [l2, a2, b2] = labFromLinear(b.r, b.g, b.b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** A just-noticeable difference, for the tests that ask whether a cue exists. */
export const JND = 2.3;
