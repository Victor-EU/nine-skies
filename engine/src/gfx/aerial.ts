/**
 * What the air looks like at a point - the clear colour, the sun, and how
 * thick the haze is. Lifted out of the frame so it can be measured (F36).
 *
 * This is build plan D12, not D14: three region sets blended once per frame at
 * the aircraft, rather than nine blended per pixel by region weight. It lived
 * in `main.ts`, which meant the two numbers G1 is partly scored on - how much
 * the sky moves as the player climbs, and how much the regions differ - were
 * unguarded constants that no test could reach.
 *
 * The invariant worth keeping, and the reason `sky` is one value: the haze
 * colour and the clear colour are the same, so terrain fading into the
 * distance lands exactly on the sky rather than near it. A seam along the
 * horizon is the one seam this game cannot afford.
 */
import { Color } from "three";
import { densityRatio } from "../sim/atmosphere.js";
import { SPIKE_REGIONS } from "../terrain/terrainMaterial.js";
import { standInRegionWeights } from "../terrain/syntheticTiles.js";

/**
 * The colour the sky tends to as the air runs out.
 *
 * Not a measured quantity - a deep blue picked to read as altitude. What it
 * is worth *is* measured: dE 32 between sea level and 4,500 m, which is the
 * whole of the GDD's "first visual cue for altitude" (F36).
 */
export const THIN_AIR_SKY = new Color(0.16, 0.34, 0.68);

/**
 * Density ratio lost before the sky is fully deep. 0.45 puts the top of the
 * curve at about 6,000 m, a little above the aircraft's ceiling, so the cue
 * is still moving everywhere the player can actually fly.
 */
export const THIN_SPAN = 0.45;

/** How deep the sky has gone, 0 at sea level to 1 in the thinnest air flown. */
export function thinness(altitudeM: number): number {
  return Math.min(1, Math.max(0, (1 - densityRatio(altitudeM)) / THIN_SPAN));
}

/**
 * The air at a point, recomputed in place.
 *
 * Allocation-free on purpose: `update` runs every frame, and three `Color`s a
 * frame is three `Color`s a frame that the collector has to think about.
 */
export class Aerial {
  /** The clear colour, and the colour terrain fades into. One value, by rule. */
  readonly sky = new Color();
  readonly sun = new Color();
  /** Extinction per real metre, before the world-unit conversion. */
  hazeDensityPerM = 0;

  private readonly haze = new Color();

  /**
   * @param inlandKm  metres east of the projection origin, in kilometres
   * @param groundM   the ground under the aircraft, which is what says where
   *                  you are - the regions are a height and a distance inland,
   *                  never the aircraft's own altitude
   * @param altitudeM the aircraft, which is what says how thin the air is
   */
  update(inlandKm: number, groundM: number, altitudeM: number): this {
    const w = standInRegionWeights(inlandKm, groundM);
    this.haze.setRGB(0, 0, 0);
    this.sun.setRGB(0, 0, 0);
    this.hazeDensityPerM = 0;
    for (let i = 0; i < SPIKE_REGIONS.length; i++) {
      const region = SPIKE_REGIONS[i]!;
      const weight = w[i]!;
      this.haze.r += region.hazeColor.r * weight;
      this.haze.g += region.hazeColor.g * weight;
      this.haze.b += region.hazeColor.b * weight;
      this.sun.r += region.sunColor.r * weight;
      this.sun.g += region.sunColor.g * weight;
      this.sun.b += region.sunColor.b * weight;
      this.hazeDensityPerM += region.hazeDensity * weight;
    }
    this.sky.copy(this.haze).lerp(THIN_AIR_SKY, thinness(altitudeM));
    return this;
  }
}
