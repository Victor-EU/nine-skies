/**
 * The HUD against the thing it is actually drawn over (F45).
 *
 * The first pass of this check measured every HUD ink against the page's
 * background colour and found 72 to 89 dE, which is a comfortable pass and
 * the wrong question: `#0d1117` is visible for one frame at boot and never
 * again. What the HUD is drawn over is the sky, and the sky is pale at low
 * altitude - which is where G1's twelve minutes are spent.
 *
 * So the backgrounds here come from `Aerial`, the same object the frame gets
 * its clear colour from, and they are converted to sRGB bytes first because
 * that is the space CSS composites in.
 */
import { describe, expect, it } from "vitest";
import type { RGB } from "three";
import { Aerial } from "../../engine/src/gfx/aerial.js";
import { simulate, VISION_TYPES } from "../../engine/src/gfx/cvd.js";
import { deltaE } from "../../engine/src/gfx/perceptual.js";
import { colorOf, over, type Rgb } from "../../engine/src/map/palette.js";

const air = new Aerial();
/** The sky as the screen shows it, in the bytes a stylesheet blends with. */
const skyBytes = (inlandKm: number, groundM: number, altitudeM: number): Rgb => {
  const target: RGB = { r: 0, g: 0, b: 0 };
  air.update(inlandKm, groundM, altitudeM).sky.getRGB(target, "srgb");
  return [target.r * 255, target.g * 255, target.b * 255];
};
const worst = (a: Rgb, b: Rgb): number =>
  Math.min(...VISION_TYPES.map((v) => deltaE(simulate(colorOf(a), v), simulate(colorOf(b), v))));

/** The four skies the prototype can put behind the HUD. */
const SKIES: [string, Rgb][] = [
  ["coast at sea level", skyBytes(300, 69, 69)],
  ["basin at sea level", skyBytes(2600, 450, 450)],
  ["coast at 5 km", skyBytes(300, 69, 5000)],
  ["plateau at 5 km", skyBytes(2700, 4200, 5000)],
];

/** From `hud.css`. */
const INK: Rgb = [242, 237, 228];
const HALO: Rgb = [6, 10, 16];
const HALO_ALPHA = 0.95;
const BAR_TRACK_ALPHA = 0.7;
const THIN_BLUE: Rgb = [143, 183, 232];
const CREAM: Rgb = [232, 217, 160];
const GLANCE = 10;

describe("the ink", () => {
  it("is the same lightness as the sky at low altitude, which is where G1 flies", () => {
    expect(worst(INK, SKIES[0]![1])).toBeLessThan(GLANCE);
    expect(worst(INK, SKIES[1]![1])).toBeLessThan(GLANCE);
    // High up it is fine, which is why reading the code never showed this.
    expect(worst(INK, SKIES[2]![1])).toBeGreaterThan(40);
  });

  it("is haloed, so a glyph has two edges whatever is behind it", () => {
    for (const [, sky] of SKIES) {
      const halo = over(HALO, HALO_ALPHA, sky);
      expect(worst(INK, halo)).toBeGreaterThan(80);
      expect(worst(halo, sky)).toBeGreaterThan(60);
    }
  });
});

describe("the density bar", () => {
  it("had a track that vanished into the sky it was drawn on", () => {
    // White at 18 %, over a pale sky, is the sky.
    for (const [, sky] of SKIES.slice(0, 2)) {
      expect(worst(over([255, 255, 255], 0.18, sky), sky)).toBeLessThan(2);
    }
  });

  it("had a thin-air colour that vanished at the altitude it reports", () => {
    // The bar turns blue at sigma 0.70 to say the air is thin, and the sky at
    // that altitude is the same blue: the cue is camouflaged by the other cue
    // for the same fact.
    expect(worst(THIN_BLUE, SKIES[2]![1])).toBeLessThan(6);
    expect(worst(THIN_BLUE, SKIES[3]![1])).toBeLessThan(8);
  });

  it("is framed now, so both ends of the bar read against their own ground", () => {
    for (const [, sky] of SKIES) {
      const track = over(HALO, BAR_TRACK_ALPHA, sky);
      expect(worst(track, sky)).toBeGreaterThan(40);
      expect(worst(THIN_BLUE, track)).toBeGreaterThan(40);
      expect(worst(CREAM, track)).toBeGreaterThan(40);
    }
  });

  it("keeps its two fills apart from each other, for a reader who sees neither hue", () => {
    expect(worst(CREAM, THIN_BLUE)).toBeGreaterThan(GLANCE);
  });
});
