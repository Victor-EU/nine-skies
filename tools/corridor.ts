/**
 * Read a built corridor from disk and turn a waypoint list into an elevation
 * profile. It exists so the route checks (F17, F21) run against real pipeline
 * output rather than a synthetic hill.
 *
 * It lives in `tools/` rather than `engine/` because it reaches for
 * `node:fs`, which the browser bundle must never see, and rather than in
 * `test/` because the content gate reads it too: D19 makes a route something
 * validated at authoring time, and authoring is not a test run.
 *
 * Every caller skips when nothing is built, because a fresh checkout has no
 * `dist-world/` and a green tick for a check that silently ran on nothing is
 * worse than a skip that says so.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TILE_SAMPLES = 65;
const TILE_CELLS = TILE_SAMPLES - 1;

export interface CorridorManifest {
  readonly corridor: string;
  readonly window: { tx0: number; ty0: number; tx1: number; ty1: number };
  readonly anchors: Record<string, { lat: number; lon: number; eastM: number; northM: number }>;
  readonly start: { eastM: number; northM: number; altitudeM: number; headingRad: number };
  readonly heights: { tiles: number };
}

export interface Corridor {
  readonly manifest: CorridorManifest;
  /** Bilinear ground elevation in real metres, from the country origin. */
  groundAt(eastM: number, northM: number): number;
}

export function loadCorridor(dir: string): Corridor | null {
  const manifestPath = join(dir, "manifest.json");
  const heightsPath = join(dir, "heights.bin");
  if (!existsSync(manifestPath) || !existsSync(heightsPath)) return null;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CorridorManifest;
  const { tx0, ty0, tx1, ty1 } = manifest.window;
  const tilesX = tx1 - tx0;
  const bytes = readFileSync(heightsPath);
  const heights = new Int16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );

  // Tile-row-major, ty ascending then tx ascending; j runs south to north.
  const sampleAt = (ci: number, cj: number): number => {
    const tx = Math.floor(ci / TILE_CELLS);
    const ty = Math.floor(cj / TILE_CELLS);
    if (tx < tx0 || tx >= tx1 || ty < ty0 || ty >= ty1) return 0;
    const tile = (ty - ty0) * tilesX + (tx - tx0);
    const i = ci - tx * TILE_CELLS;
    const j = cj - ty * TILE_CELLS;
    return heights[tile * TILE_SAMPLES * TILE_SAMPLES + j * TILE_SAMPLES + i] ?? 0;
  };

  return {
    manifest,
    groundAt(eastM, northM) {
      const ex = eastM / 1000;
      const ny = northM / 1000;
      const i0 = Math.floor(ex);
      const j0 = Math.floor(ny);
      const fx = ex - i0;
      const fy = ny - j0;
      return (
        sampleAt(i0, j0) * (1 - fx) * (1 - fy) +
        sampleAt(i0 + 1, j0) * fx * (1 - fy) +
        sampleAt(i0, j0 + 1) * (1 - fx) * fy +
        sampleAt(i0 + 1, j0 + 1) * fx * fy
      );
    },
  };
}

export interface Waypoint {
  readonly eastM: number;
  readonly northM: number;
}

export interface ProfiledRoute {
  /** Ground elevation at one-kilometre intervals from the start. */
  readonly profileM: number[];
  /** Distance from the start at which each leg ends, km. */
  readonly legEndKm: number[];
  readonly lengthKm: number;
}

/**
 * Sample the ground under a polyline, one kilometre at a time.
 *
 * Indexed by absolute distance from the start rather than per leg, because
 * rounding each leg separately lets the profile drift a kilometre per corner
 * away from the distance the flight is measuring against - six corners into
 * Sea to Sky that is enough to read the wrong side of a ridge.
 */
export function profileAlong(
  corridor: Corridor,
  waypoints: readonly Waypoint[],
): ProfiledRoute {
  const legEndKm: number[] = [];
  let lengthKm = 0;
  for (let w = 0; w + 1 < waypoints.length; w++) {
    const from = waypoints[w]!;
    const to = waypoints[w + 1]!;
    lengthKm += Math.hypot(to.eastM - from.eastM, to.northM - from.northM) / 1000;
    legEndKm.push(lengthKm);
  }

  const profileM: number[] = [];
  let leg = 0;
  for (let km = 0; km <= Math.ceil(lengthKm); km++) {
    while (leg + 1 < legEndKm.length && km > legEndKm[leg]!) leg++;
    const from = waypoints[leg]!;
    const to = waypoints[leg + 1]!;
    const legStartKm = leg === 0 ? 0 : legEndKm[leg - 1]!;
    const legKm = legEndKm[leg]! - legStartKm;
    const t = Math.min(1, (km - legStartKm) / legKm);
    profileM.push(
      corridor.groundAt(
        from.eastM + (to.eastM - from.eastM) * t,
        from.northM + (to.northM - from.northM) * t,
      ),
    );
  }
  return { profileM, legEndKm, lengthKm };
}
