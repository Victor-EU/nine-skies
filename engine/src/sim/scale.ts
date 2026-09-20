/**
 * World scale - the single source of truth for compression and exaggeration.
 *
 * Build plan D6: these are live values, never baked into data, because the
 * 1:5 / 1:8 / 1:12 decision is a playtest at gate G1 and a playtest needs a
 * toggle.
 *
 * THE ASYMMETRY
 * -------------
 * This is about the simulation, not the picture. The sim works in real metres
 * throughout; `verticalExaggeration` below is a rendering scale and changes
 * none of what follows.
 *
 * The aircraft's climb rate is real: 7.1 m/s down low, 2.1 m/s on the plateau,
 * zero at 6,200 m. Its ground speed is multiplied by a large gain so the
 * country crosses in under an hour. So a metre of altitude costs roughly forty
 * times what a metre of distance costs.
 *
 * That is not a fudge to work around the compression - it is the GDD's thesis
 * expressed as a constant. Distance is cheap, altitude is expensive, and the
 * player learns it in the controls before they read it on a card. Compressing
 * the vertical to match would make the plateau climb take fifteen seconds and
 * the game would have nothing left to say.
 */

export interface WorldScale {
  /** Horizontal compression. 8 means the world is built at 1/8 real size. */
  horizontalCompression: number;
  /**
   * Vertical scale, rendering only - the sim uses real metres. Above 1 it
   * exaggerates, below 1 it flattens; horizontal compression already
   * exaggerates relief on its own, so the useful range is below 1.
   */
  verticalExaggeration: number;
}

/**
 * Compression is the GDD's; it is decided at gate G1.
 *
 * The exaggeration is not the GDD's 1.5x any more. That value was tuned
 * against the stand-in world, which turned out to be ~15x smoother than China
 * (F13), and measuring it over real elevation showed 1.5x puts a third of the
 * flown route past 60 degrees and a ninth of it past 75 -- spikes, not
 * mountains (F14). What governs the picture is the product
 * `horizontalCompression * verticalExaggeration`; at 1:8, 0.75 puts it at 6,
 * where ridgelines and valley floors are legible again.
 */
export const DEFAULT_SCALE: WorldScale = {
  horizontalCompression: 8,
  verticalExaggeration: 0.75,
};

/**
 * The three candidates the prototype A/B tests.
 *
 * Note what the C key actually sweeps: with the exaggeration fixed, cycling
 * these varies the product too, so at 0.75 it walks apparent exaggeration
 * through 3.75, 6 and 9. That happens to be a sensible drama range, but it
 * is still two questions in one control - see F14 for the split G1 needs.
 */
export const COMPRESSION_CANDIDATES = [5, 8, 12] as const;

export type SpeedMode = "low" | "cruise" | "boost";

/**
 * Indicated airspeed per mode, m/s. Real numbers for a light piston single:
 * a little above stall, a normal cruise, and the top of the green arc.
 */
export const MODE_IAS_MS: Record<SpeedMode, number> = {
  low: 38,
  cruise: 52,
  boost: 70,
};

/**
 * Ground covered per minute, real kilometres. These are the GDD's numbers and
 * they are the spec - the gains below are derived from them, not the reverse.
 */
export const MODE_GROUND_KM_PER_MIN: Record<SpeedMode, number> = {
  low: 130 / 3,
  cruise: 130,
  boost: 260,
};

/**
 * Horizontal gain: real ground metres travelled per metre of true airspeed.
 *
 * Applied to the horizontal axes only. Note that because true airspeed rises
 * with altitude at constant indicated airspeed, ground speed rises too - about
 * 163 km/min over the plateau against 130 at the coast. The plateau is crossed
 * quickly and climbed slowly, which is exactly what it is like.
 */
export function groundGain(mode: SpeedMode): number {
  const groundMs = (MODE_GROUND_KM_PER_MIN[mode] * 1000) / 60;
  return groundMs / MODE_IAS_MS[mode];
}

/** Real metres -> rendered world units, horizontal. */
export function toWorldH(realM: number, scale: WorldScale): number {
  return realM / scale.horizontalCompression;
}

/** Real metres -> rendered world units, vertical. */
export function toWorldV(realM: number, scale: WorldScale): number {
  return realM * scale.verticalExaggeration;
}

/**
 * Minutes to fly a real distance at a mode's sea-level ground speed.
 * Used by the expedition tooling to check a route fits its time budget.
 */
export function minutesForKm(realKm: number, mode: SpeedMode): number {
  return realKm / MODE_GROUND_KM_PER_MIN[mode];
}
