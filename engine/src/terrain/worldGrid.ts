import { TILE_KM } from "./syntheticTiles.js";
import { HORIZON_SAMPLE_KM } from "./horizonField.js";

/**
 * The country grid the pipeline cuts (workstream A stage 2, finding F10).
 *
 * Albers Equal Area Conic, CM 105 E, standard parallels 25 N and 47 N, 1 km
 * cells, 64 km tiles, origin at the south-west corner of tile (0, 0). Tile
 * indices reach the content hash and the save file, so these are frozen
 * constants rather than anything derived at runtime.
 *
 * They are duplicated in `pipeline/nineskies/grid.py`, which owns the
 * projection. Nothing imports across that boundary, so
 * `pipeline/tests/test_tiles.py` reads this file and fails if the two drift.
 */
export const COUNTRY_TILES_X = 105;
export const COUNTRY_TILES_Y = 69;

export const COUNTRY_EAST_KM = COUNTRY_TILES_X * TILE_KM;
export const COUNTRY_NORTH_KM = COUNTRY_TILES_Y * TILE_KM;

/** Samples in the country-wide horizon field, and its size on the wire. */
export const HORIZON_FIELD_WIDTH =
  Math.ceil(COUNTRY_EAST_KM / HORIZON_SAMPLE_KM) + 1;
export const HORIZON_FIELD_HEIGHT =
  Math.ceil(COUNTRY_NORTH_KM / HORIZON_SAMPLE_KM) + 1;
export const HORIZON_FIELD_BYTES =
  HORIZON_FIELD_WIDTH * HORIZON_FIELD_HEIGHT * 2;

/**
 * Albers Equal Area Conic, forward, WGS84 (D1).
 *
 * The pipeline owns the projection and computes every anchor with PROJ. That
 * was enough while the only projected things in the game were tiles, which
 * arrive pre-projected. It stops being enough the moment content carries
 * coordinates: 150 discovery triggers, nine expedition routes and every map
 * pin are authored in degrees, and something has to put them in the world.
 *
 * Snyder's ellipsoidal equations, not the spherical ones. On the central
 * meridian at 40 N the two disagree by 16.9 km - seventeen tiles - which
 * would put a card's trigger on the far side of a mountain range and still
 * look plausible on a map.
 *
 * Verified against the corridor manifest's own anchors in
 * `test/route/albers.test.ts` - seven points PROJ computed independently -
 * so this cannot drift from `pipeline/nineskies/grid.py` unnoticed.
 */
const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257_223_563;
const E2 = 2 * WGS84_F - WGS84_F * WGS84_F;
const E = Math.sqrt(E2);

const STANDARD_PARALLEL_1 = 25;
const STANDARD_PARALLEL_2 = 47;
const LATITUDE_OF_ORIGIN = 0;
const CENTRAL_MERIDIAN = 105;

/** South-west corner of tile (0, 0) in projected metres (grid.py). */
export const ORIGIN_X_M = -3_456_000;
export const ORIGIN_Y_M = 1_792_000;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Snyder 3-12: the authalic area function. */
function authalic(latRad: number): number {
  const s = Math.sin(latRad);
  return (
    (1 - E2) *
    (s / (1 - E2 * s * s) -
      (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)))
  );
}

/** Snyder 14-15: the scale factor along a parallel. */
function parallelScale(latRad: number): number {
  const s = Math.sin(latRad);
  return Math.cos(latRad) / Math.sqrt(1 - E2 * s * s);
}

const PHI_1 = rad(STANDARD_PARALLEL_1);
const PHI_2 = rad(STANDARD_PARALLEL_2);
const M1 = parallelScale(PHI_1);
const M2 = parallelScale(PHI_2);
const Q1 = authalic(PHI_1);
const Q2 = authalic(PHI_2);
const N = (M1 * M1 - M2 * M2) / (Q2 - Q1);
const C = M1 * M1 + N * Q1;
const RHO_0 = (WGS84_A * Math.sqrt(C - N * authalic(rad(LATITUDE_OF_ORIGIN)))) / N;

export interface WorldPosition {
  /** Metres east of the country grid's south-west corner. */
  eastM: number;
  /** Metres north of it. */
  northM: number;
}

/**
 * Degrees to the world's own coordinates - metres from the country grid's
 * south-west corner, which is what the manifest's anchors are in and what the
 * simulation flies in.
 */
export function projectAlbers(latDeg: number, lonDeg: number): WorldPosition {
  const theta = N * rad(lonDeg - CENTRAL_MERIDIAN);
  const rho = (WGS84_A * Math.sqrt(C - N * authalic(rad(latDeg)))) / N;
  return {
    eastM: rho * Math.sin(theta) - ORIGIN_X_M,
    northM: RHO_0 - rho * Math.cos(theta) - ORIGIN_Y_M,
  };
}

/**
 * The world's own coordinates back to degrees. Snyder 14-8 to 14-11, with
 * 3-16 iterated for the latitude.
 *
 * Needed because two things the player is shown are functions of longitude
 * rather than of grid metres: local solar time, and where the sun is. The
 * aircraft flies in projected metres and always will - that is what makes the
 * floating origin and the tile arithmetic simple - so the conversion belongs
 * here, beside the forward one it has to agree with.
 *
 * The latitude is iterative because the authalic function cannot be inverted
 * in closed form on an ellipsoid. It converges in three or four
 * passes over China; the loop is capped so a coordinate outside the
 * projection's domain returns rather than spins.
 */
export function unprojectAlbers(eastM: number, northM: number): { latDeg: number; lonDeg: number } {
  const x = eastM + ORIGIN_X_M;
  const y = RHO_0 - (northM + ORIGIN_Y_M);
  const rho = Math.hypot(x, y);
  const theta = N >= 0 ? Math.atan2(x, y) : Math.atan2(-x, -y);
  const lonDeg = CENTRAL_MERIDIAN + (theta / N) * (180 / Math.PI);

  const q = (C - (rho * rho * N * N) / (WGS84_A * WGS84_A)) / N;
  let phi = Math.asin(Math.min(1, Math.max(-1, q / 2)));
  for (let i = 0; i < 12; i++) {
    const s = Math.sin(phi);
    const one = 1 - E2 * s * s;
    const delta =
      ((one * one) / (2 * Math.cos(phi))) *
      (q / (1 - E2) - s / one + (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
    phi += delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return { latDeg: (phi * 180) / Math.PI, lonDeg };
}
