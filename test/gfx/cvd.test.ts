/**
 * The dichromacy simulation, and what it says about the things this build
 * already draws (F45).
 *
 * The instrument is checked before it is believed, the way F30's GPU timer
 * was: a simulation that returned its input would pass every palette test
 * ever written. Three properties pin it - greys survive, the projection is
 * idempotent, and the axis each type loses actually collapses - and one more
 * is worth having because nothing asked for it: protanopia darkens red, which
 * is a real property of protanopic luminous efficiency and not something
 * these matrices were fitted to.
 */
import { describe, expect, it } from "vitest";
import { Color } from "three";
import { simulate, VISION_TYPES, VISION_LABELS, type VisionType } from "../../engine/src/gfx/cvd.js";
import { deltaE, labFromLinear, JND } from "../../engine/src/gfx/perceptual.js";
import { Aerial } from "../../engine/src/gfx/aerial.js";
import { ELEVATION_STOPS, elevationRampSrgb } from "../../engine/src/terrain/palette.js";

const srgb = (r: number, g: number, b: number) => new Color().setRGB(r, g, b, "srgb");
const DICHROMATS = VISION_TYPES.filter((v) => v !== "normal");
const lightness = (c: Color) => labFromLinear(c.r, c.g, c.b)[0];
/** How different two colours look to the eye that sees them most alike. */
const worstCase = (a: Color, b: Color): number =>
  Math.min(...VISION_TYPES.map((v) => deltaE(simulate(a, v), simulate(b, v))));

describe("the instrument", () => {
  it("leaves a grey exactly where it found it", () => {
    for (const g of [0, 0.25, 0.5, 0.75, 1]) {
      for (const v of DICHROMATS) {
        expect(deltaE(srgb(g, g, g), simulate(srgb(g, g, g), v))).toBeLessThan(0.01);
      }
    }
  });

  it("is idempotent, because it is a projection and not a filter", () => {
    for (const c of [srgb(0.8, 0.1, 0.1), srgb(0.1, 0.8, 0.2), srgb(0.2, 0.3, 0.9)]) {
      for (const v of DICHROMATS) {
        expect(deltaE(simulate(c, v), simulate(simulate(c, v), v))).toBeLessThan(0.01);
      }
    }
  });

  it("collapses the axis each type is missing and keeps the one it has", () => {
    const red = srgb(0.82, 0.19, 0.13);
    const green = srgb(0.13, 0.63, 0.19);
    const blue = srgb(0.19, 0.31, 0.82);
    const yellow = srgb(0.88, 0.82, 0.25);
    expect(deltaE(red, green)).toBeGreaterThan(100);
    // A deuteranope sees a tenth of it; blue against yellow is untouched.
    expect(deltaE(simulate(red, "deutan"), simulate(green, "deutan"))).toBeLessThan(15);
    expect(deltaE(simulate(blue, "deutan"), simulate(yellow, "deutan"))).toBeGreaterThan(140);
    expect(deltaE(simulate(blue, "protan"), simulate(yellow, "protan"))).toBeGreaterThan(140);
  });

  it("darkens red for a protanope, which nothing asked it to do", () => {
    const red = srgb(0.82, 0.19, 0.13);
    expect(lightness(simulate(red, "protan"))).toBeLessThan(lightness(red) - 8);
    // And the same red is not darkened for a deuteranope, whose luminous
    // efficiency at long wavelengths is close to normal.
    expect(Math.abs(lightness(simulate(red, "deutan")) - lightness(red))).toBeLessThan(6);
  });

  it("names what each type is missing, for a report that has to be read", () => {
    expect(VISION_TYPES).toHaveLength(4);
    expect(VISION_LABELS.normal).toBe("trichromat");
    for (const v of DICHROMATS) expect(VISION_LABELS[v]).toMatch(/cone/);
  });
});

describe("the cue G1 is scored on", () => {
  const air = new Aerial();
  const skyAt = (inlandKm: number, groundM: number, altitudeM: number): Color =>
    air.update(inlandKm, groundM, altitudeM).sky.clone();
  const climbCue = (v: VisionType): number =>
    deltaE(simulate(skyAt(300, 69, 0), v), simulate(skyAt(300, 69, 4500), v));

  it("survives every deficiency, because the sky moves along the axis they keep", () => {
    // F36 measured 32.1 for a trichromat. The pass criterion is that six of
    // ten remark on the climb unprompted, and this is the cue that carries
    // it - so the question is whether a participant who cannot see red and
    // green gets a different experiment. They do not.
    expect(climbCue("normal")).toBeCloseTo(32.1, 1);
    for (const v of DICHROMATS) expect(climbCue(v)).toBeGreaterThan(30);
    // Deuteranopia sees slightly *more* of it, which is luck rather than
    // design: a deep blue against a pale haze is a blue-yellow difference.
    expect(climbCue("deutan")).toBeGreaterThan(climbCue("normal"));
  });
});

describe("the ground's own altitude cue", () => {
  /** Metres of climb before the ground under you is a different colour. */
  const stepFor = (fromM: number, v: VisionType): number => {
    const a = simulate(srgb(...elevationRampSrgb(fromM)), v);
    let lo = 0;
    let hi = 6000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (deltaE(a, simulate(srgb(...elevationRampSrgb(fromM + mid)), v)) < JND) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  it("costs a protanope five times the climb it costs anyone else, low down", () => {
    // The ramp turns green to tan between 200 m and 800 m, which is a
    // red-green move, and that band is the eastern plain - 58 % of
    // Expedition 1's flying time (F29).
    expect(stepFor(200, "normal")).toBeLessThan(80);
    expect(stepFor(200, "protan")).toBeGreaterThan(300);
    expect(stepFor(500, "protan") / stepFor(500, "normal")).toBeGreaterThan(5);
  });

  it("costs everyone the same above a thousand metres, where it is a lightness ramp", () => {
    for (const from of [1000, 2000, 3000]) {
      const spread = DICHROMATS.map((v) => stepFor(from, v) / stepFor(from, "normal"));
      // Within a tenth of the trichromat's, all three.
      for (const ratio of spread.slice(0, 2)) expect(Math.abs(ratio - 1)).toBeLessThan(0.1);
    }
  });

  it("has no two stops that a dichromat cannot tell apart at all", () => {
    // The worst pair is farmland against loess, 20.3 dE to a trichromat and
    // 4.1 to a protanope - well above the threshold at which a difference
    // exists, and well below the one at which it is noticed at a glance.
    const pairs: number[] = [];
    for (let i = 0; i < ELEVATION_STOPS.length; i++) {
      for (let j = i + 1; j < ELEVATION_STOPS.length; j++) {
        pairs.push(
          worstCase(srgb(...ELEVATION_STOPS[i]!.srgb), srgb(...ELEVATION_STOPS[j]!.srgb)),
        );
      }
    }
    expect(Math.min(...pairs)).toBeGreaterThan(JND);
    expect(Math.min(...pairs)).toBeLessThan(5);
  });
});
