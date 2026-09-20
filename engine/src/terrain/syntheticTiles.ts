import { TILE_SAMPLES } from "./tileArray.js";

/**
 * Stand-in terrain for the prototype spike.
 *
 * The real pipeline (workstream A) produces these tiles from Copernicus DEM.
 * Until it does, the spike needs something to fly over - and the only honest
 * choice is terrain shaped like the thing gate G1 is asking about. So this is
 * not noise: it is China's east-west profile, the three great steps, with the
 * Sichuan Basin dropped in as a bowl before the plateau wall and a Himalayan
 * ridge at the far west.
 *
 * That lets the prototype answer G1's real question - does the plateau climb
 * land emotionally - before a single byte of DEM has been downloaded.
 *
 *   x = kilometres inland from the east coast
 *   y = kilometres north of the southern coast
 */

export const TILE_KM = 64;
export const SAMPLE_KM = TILE_KM / (TILE_SAMPLES - 1); // 1 km

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/** Smooth ramp between two x positions. */
function ramp(x: number, a: number, b: number): number {
  return smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));
}

/**
 * The base profile: elevation in metres as a function of distance inland.
 * This is the curve a player should be able to sketch after three expeditions.
 */
export function stepProfileM(inlandKm: number): number {
  // First step: coastal plain and delta, 0-500 m.
  let m = 5 + 495 * ramp(inlandKm, 60, 1200);
  // Second step: loess and the middle uplands, to ~1,800 m.
  m += 1300 * ramp(inlandKm, 1250, 2350);
  // The Sichuan Basin is a hole inside the second step - the fog sits in it
  // and the plateau wall is what you see when you climb out.
  m -= 1250 * ramp(inlandKm, 2380, 2600) * (1 - ramp(inlandKm, 2900, 3080));
  // Third step: the plateau wall, then flat ground at ~4,500 m.
  m += 2700 * ramp(inlandKm, 3050, 3450);
  return m;
}

/** Elevation in real metres at a real position. */
export function sampleElevationM(inlandKm: number, northKm: number): number {
  let m = stepProfileM(inlandKm);

  // Relief grows westward: the plain is flat, the plateau is corrugated.
  const relief = 40 + 900 * ramp(inlandKm, 900, 3500);
  m += (fbm(inlandKm / 90, northKm / 90, 5) - 0.5) * relief;
  m += (fbm(inlandKm / 22, northKm / 22, 4) - 0.5) * relief * 0.35;

  // A Himalayan ridge along the far southwest.
  const ridge = ramp(inlandKm, 4350, 4700) * (1 - ramp(inlandKm, 4780, 5050));
  // Tuned so the highest point stays just under Everest - nothing in the
  // stand-in world should out-top the real summit.
  m += ridge * (2000 + 1500 * fbm(inlandKm / 40, northKm / 40, 3)) *
       (1 - ramp(northKm, 500, 1400));

  // A Turpan-like depression in the northwest, below sea level.
  const dx = (inlandKm - 3900) / 190;
  const dy = (northKm - 2450) / 130;
  const bowl = Math.exp(-(dx * dx + dy * dy));
  m -= bowl * (m + 200);

  return m;
}

/** One tile's heightmap: TILE_SAMPLES^2 Int16 metres, row-major. */
export function generateTile(tx: number, ty: number): Int16Array {
  const out = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
  const baseX = tx * TILE_KM;
  const baseY = ty * TILE_KM;
  for (let j = 0; j < TILE_SAMPLES; j++) {
    for (let i = 0; i < TILE_SAMPLES; i++) {
      const m = sampleElevationM(baseX + i * SAMPLE_KM, baseY + j * SAMPLE_KM);
      // Int16 metres holds -154 m to 8,849 m with room to spare (D2).
      out[j * TILE_SAMPLES + i] = Math.max(-32768, Math.min(32767, Math.round(m)));
    }
  }
  return out;
}

/** Extent of the stand-in world, in tiles. Roughly China's bounding box. */
export const WORLD_TILES_X = Math.ceil(5200 / TILE_KM);
export const WORLD_TILES_Y = Math.ceil(3400 / TILE_KM);

/**
 * Stand-in ground temperature, deg C.
 *
 * REPLACED BY THE CLIMATE ATLAS (build plan D8 / workstream A step 8). This
 * exists only so the prototype's thermometer moves; it is a latitude gradient
 * and a lapse rate, not a climate model, and no discovery card may ever quote
 * a number that came out of it.
 */
export function standInGroundTempC(
  northKm: number,
  elevationM: number,
  month: number,
): number {
  const winter = Math.cos(((month - 1) / 12) * Math.PI * 2); // +1 in January
  const southSeaLevel = 24 - 4 * winter;
  const northSeaLevel = 0 - 22 * winter;
  const f = Math.min(1, Math.max(0, northKm / 3400));
  const seaLevel = southSeaLevel + (northSeaLevel - southSeaLevel) * f;
  return seaLevel - (6.5 * Math.max(0, elevationM)) / 1000;
}

/** Stand-in monthly precipitation, mm. Wet southeast, dry northwest. */
export function standInPrecipMm(inlandKm: number, northKm: number, month: number): number {
  const monsoon = 0.35 + 0.65 * Math.max(0, Math.cos(((month - 7) / 12) * Math.PI * 2));
  const dryness = Math.min(1, Math.max(0, inlandKm / 3200));
  return 240 * monsoon * (1 - dryness) ** 1.6;
}

/**
 * Stand-in region weights, for blending the atmosphere table.
 *
 * REPLACED BY THE REGION RASTER (build plan D14): production blends nine
 * parameter sets by per-pixel region weight, and the same weights drive music,
 * card triggers and the map. This is three regions keyed off elevation and
 * distance inland, evaluated once per frame at the aircraft - enough to prove
 * that the plateau's air reads as clean and the basin's as milk, which is the
 * half of the look that gate G1 is actually asking about.
 *
 * Order matches `SPIKE_REGIONS`: east coast, Sichuan Basin, plateau.
 */
export function standInRegionWeights(
  inlandKm: number,
  groundElevationM: number,
): [number, number, number] {
  // The plateau is a height, not a place: above 4,000 m you are on it.
  const plateau = smooth(
    Math.min(1, Math.max(0, (groundElevationM - 2400) / 1600)),
  );
  // The basin is the hole in the second step - low ground, but a long way in.
  const inBowl = ramp(inlandKm, 2300, 2450) * (1 - ramp(inlandKm, 2950, 3150));
  const low = 1 - smooth(Math.min(1, Math.max(0, (groundElevationM - 400) / 1200)));
  const basin = inBowl * low * (1 - plateau);
  const coast = Math.max(0, 1 - plateau - basin);
  const total = plateau + basin + coast;
  return [coast / total, basin / total, plateau / total];
}
