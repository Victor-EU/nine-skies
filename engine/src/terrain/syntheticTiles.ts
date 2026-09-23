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
 *
 * Unlike its neighbour below it runs the right way round, and it is left
 * alone on purpose (F46). Two things about it are worth knowing. Its `/ 3400`
 * is the *synthetic* world's north extent and the real grid is 4,416 km tall
 * (`COUNTRY_NORTH_KM`), so everything north of Harbin is pinned at the same
 * sea-level temperature - the far northeast has no gradient at all. And
 * re-anchoring it to the real grid would move Harbin in January from -21.3 C
 * to -13.3 C, which is away from the -25 C the GDD's Ice to Coconuts is built
 * on. That is a calibration the atlas should make, not a sign error to fix
 * here.
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

/**
 * Stand-in monthly precipitation, mm. Wet southeast, dry northwest.
 *
 * REPLACED BY THE CLIMATE ATLAS, like the thermometer above, and with the
 * same rule: no discovery card may quote a number that came out of it.
 *
 * **It ran the wrong way for as long as it has existed** (F46). Its first
 * argument was called `inlandKm` and the app passed the aircraft's projected
 * *easting* - a coordinate measured from a false origin 3,456 km west of the
 * central meridian, so it grows toward the sea rather than away from it, and
 * the `/ 3200` saturated every populated place east of the Ordos. Shanghai,
 * Wuhan, Chongqing, Chengdu, Harbin and Sanya all read exactly 0 % humidity
 * in every month; Lhasa read 7 % and Kashgar, in the Taklamakan, read the
 * wettest of the nine at 22 %. The GDD's "this is wet - humidity 90 %" row
 * was unreachable anywhere in China, and Expedition 1's own authored note
 * about thick Sichuan fog was contradicted by its own HUD.
 *
 * So it takes the two numbers climate actually varies with, and it takes them
 * as a named place rather than as two bare numbers - which is the half of the
 * fix that stops it happening again. Two `number` parameters are two things a
 * caller can transpose or fill from the wrong coordinate system and the
 * compiler will agree; `unprojectAlbers` already returns exactly this shape,
 * so the only easy way to call it is the right one.
 *
 * The shape - the 240 mm cap, the exponent, the monsoon term - is untouched
 * calibration; what changed is that `dryness` now rises toward the northwest,
 * which is what the line above it always claimed. It is still a stand-in, and
 * the residual is real: Turpan is the driest place in China and reads wetter
 * than Kashgar, because longitude and latitude cannot tell a basin from its
 * surroundings. What it is now is right-way-round, which is a thing a test
 * can hold it to.
 */
export function standInPrecipMm(at: GeoDegrees, month: number): number {
  const monsoon = 0.35 + 0.65 * Math.max(0, Math.cos(((month - 7) / 12) * Math.PI * 2));
  const dryness = continentality(at);
  return 240 * monsoon * (1 - dryness) ** 1.6;
}

/** Where on the Earth, in degrees. The shape `unprojectAlbers` hands back. */
export interface GeoDegrees {
  readonly latDeg: number;
  readonly lonDeg: number;
}

/** The eastern seaboard, and the far interior, near enough for a stand-in. */
const COAST_LON_DEG = 121;
const INTERIOR_LON_DEG = 75;
/** China's own latitude span, south cape to the Heilongjiang bend. */
const SOUTH_LAT_DEG = 18;
const NORTH_LAT_DEG = 53;

/**
 * How far from the sea this place is, 0 at the southeast corner and 1 in the
 * northwest - the diagonal the docstring above has always named.
 *
 * Longitude and latitude weigh the same because neither is the story on its
 * own: longitude alone puts Harbin on the coast, latitude alone puts Kashgar
 * and Shanghai in the same place.
 */
function continentality({ latDeg, lonDeg }: GeoDegrees): number {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const west = clamp01((COAST_LON_DEG - lonDeg) / (COAST_LON_DEG - INTERIOR_LON_DEG));
  const north = clamp01((latDeg - SOUTH_LAT_DEG) / (NORTH_LAT_DEG - SOUTH_LAT_DEG));
  return clamp01((west + north) / 2);
}
