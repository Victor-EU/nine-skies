/**
 * What the screen looks like to a reader with two cone types instead of three.
 *
 * The comfort row of workstream D asks for a colour-blind-safe map, and
 * `perceptual.ts` was written with the question in its own docstring - *"are
 * two elevation steps distinguishable to a colour-blind reader"* - and then
 * never asked it. This is the half that lets it be asked: a dichromat's view
 * of a colour, so `deltaE` can be taken between two colours *as that reader
 * sees them* rather than as a trichromat does.
 *
 * Viénot, Brettel & Mollon (1999): take the colour into LMS cone response,
 * project it onto the plane the missing cone leaves behind, and come back.
 * The projection is what makes this a simulation rather than a filter - two
 * colours that differ only along the lost axis land on the same point, which
 * is precisely the failure a palette has to be checked against.
 *
 * **In linear light, like everything else here.** LMS is a linear function of
 * radiance, so the matrices below are only correct on linear-sRGB triples -
 * which is what a `three` Color holds, and what `deltaE` already expects.
 * Applied to gamma-encoded bytes they produce a picture that looks roughly
 * right and numbers that are wrong, the same trap `labFromLinear` names.
 *
 * **It models the severe end and says so.** Perhaps 8 % of men and 0.5 % of
 * women have some red-green deficiency, but most of that is anomalous
 * trichromacy - a shifted cone, not a missing one - and dichromacy proper is
 * nearer 2 % of men. A palette checked against dichromacy is checked against
 * the worst case rather than the median one, which is the only version of this
 * test worth writing: an anomalous trichromat sees a compressed version of
 * what a dichromat cannot see at all.
 */
import { Color } from "three";

export type VisionType = "normal" | "protan" | "deutan" | "tritan";

/** Normal first, so a report reads as "and here is what it costs". */
export const VISION_TYPES: readonly VisionType[] = ["normal", "protan", "deutan", "tritan"];

/** For a report: what each type is missing, in words a protocol can use. */
export const VISION_LABELS: Record<VisionType, string> = {
  normal: "trichromat",
  protan: "no L cone (protanopia)",
  deutan: "no M cone (deuteranopia)",
  tritan: "no S cone (tritanopia)",
};

// Linear sRGB -> LMS, and back. Viénot 1999's matrices, which are the
// Smith-Pokorny fundamentals scaled so that equal-energy white is (1,1,1).
const TO_LMS = [
  17.8824, 43.5161, 4.11935,
  3.45565, 27.1554, 3.86714,
  0.0299566, 0.184309, 1.46709,
] as const;

const FROM_LMS = [
  0.0809445, -0.130504, 0.116721,
  -0.0102485, 0.0540194, -0.113615,
  -0.000365294, -0.00412163, 0.693513,
] as const;

/**
 * The projection in LMS, one row per cone.
 *
 * Each replaces the missing cone's response with the best linear estimate the
 * two survivors give, which is the plane the dichromat's gamut collapses onto.
 * Tritanopia's plane is the crude one - Brettel's two-plane construction is
 * more faithful at the blue end - and it is kept because the question asked of
 * it here is whether anything on screen relies on a blue-yellow distinction,
 * which either version answers.
 */
const PLANES: Record<Exclude<VisionType, "normal">, readonly number[]> = {
  protan: [0, 2.02344, -2.52581, 0, 1, 0, 0, 0, 1],
  deutan: [1, 0, 0, 0.494207, 0, 1.24827, 0, 0, 1],
  tritan: [1, 0, 0, 0, 1, 0, -0.395913, 0.801109, 0],
};

function apply(m: readonly number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z,
  ];
}

/**
 * The same colour, seen by that eye. Linear sRGB in, linear sRGB out.
 *
 * The result is clamped to the gamut because a projection can leave it: a
 * saturated red projects to a point no monitor can show, and the honest thing
 * for a *legibility* test is to compare what the screen can actually put
 * there. Out-of-gamut arithmetic would report differences the reader could
 * not have.
 */
export function simulate(c: Color, vision: VisionType): Color {
  if (vision === "normal") return c.clone();
  const [l, m, s] = apply(TO_LMS, c.r, c.g, c.b);
  const [l2, m2, s2] = apply(PLANES[vision], l, m, s);
  const [r, g, b] = apply(FROM_LMS, l2, m2, s2);
  return new Color(clamp01(r), clamp01(g), clamp01(b));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
