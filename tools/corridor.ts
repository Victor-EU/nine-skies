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
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TILE_SAMPLES = 65;
const TILE_CELLS = TILE_SAMPLES - 1;

export interface CorridorManifest {
  readonly corridor: string;
  readonly resolutionM: number;
  readonly window: { tx0: number; ty0: number; tx1: number; ty1: number };
  readonly anchors: Record<string, { lat: number; lon: number; eastM: number; northM: number }>;
  readonly start: { eastM: number; northM: number; altitudeM: number; headingRad: number };
  readonly heights: { tiles: number; sha256: string };
  /**
   * The source rasters this world was built from (D24), or `unrecorded: true`
   * for a world built before they were.
   */
  readonly source?: { bucket?: string; tiles?: number; sha256?: string; unrecorded?: boolean };
}

/**
 * The part of a built world that answers "what is under this point?".
 *
 * Split out from `Corridor` because it is all a flown challenge ever asks,
 * and a committed patch of ground can answer it without being a corridor
 * (D39). A `Corridor` satisfies it; so does `patchGround`.
 */
export interface GroundField {
  /** Bilinear ground elevation in real metres, from the country origin. */
  groundAt(eastM: number, northM: number): number;
  /**
   * Whether this build has ground under a point at all.
   *
   * `groundAt` answers 0 where there is nothing, which is indistinguishable
   * from the East China Sea. A corridor is a strip and a patch is narrower
   * still, so anything flown across the edge reads as a flight over calm
   * water and clears everything -- the worst possible failure for a gate,
   * because it is silent and it is green.
   */
  covers(eastM: number, northM: number): boolean;
}

export interface Corridor extends GroundField {
  readonly manifest: CorridorManifest;
  /**
   * The heightfield's digest as measured, not as the manifest claims it.
   *
   * The manifest records a SHA and until D23 nothing ever compared it to the
   * bytes beside it, so every section was stamped with a number it had taken
   * on the manifest's word. Measuring it costs nothing here: the whole file
   * is already in memory by the time this is computed.
   */
  readonly heightsSha256: string;
  /**
   * One sample of the world's own lattice, or null where nothing is built.
   *
   * `groundAt` answers a question the world does not hold: an elevation
   * between four samples, at a point no raster cell is centred on. This
   * answers the question it does hold, which is what makes a committed patch
   * of ground possible -- a patch cut from these numbers is a subset of the
   * world rather than a resampling of it, and reproduces `groundAt` exactly
   * rather than to a rounding (D39, F44).
   */
  sampleAtKm(i: number, j: number): number | null;
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

  const inWindow = (ci: number, cj: number): boolean => {
    const tx = Math.floor(ci / TILE_CELLS);
    const ty = Math.floor(cj / TILE_CELLS);
    return tx >= tx0 && tx < tx1 && ty >= ty0 && ty < ty1;
  };

  // Tile-row-major, ty ascending then tx ascending; j runs south to north.
  const sampleAt = (ci: number, cj: number): number => {
    if (!inWindow(ci, cj)) return 0;
    const tx = Math.floor(ci / TILE_CELLS);
    const ty = Math.floor(cj / TILE_CELLS);
    const tile = (ty - ty0) * tilesX + (tx - tx0);
    const i = ci - tx * TILE_CELLS;
    const j = cj - ty * TILE_CELLS;
    return heights[tile * TILE_SAMPLES * TILE_SAMPLES + j * TILE_SAMPLES + i] ?? 0;
  };

  return {
    manifest,
    heightsSha256: createHash("sha256").update(bytes).digest("hex"),
    sampleAtKm: (i, j) => (inWindow(i, j) ? sampleAt(i, j) : null),
    // The window is a rectangle in tile space and the tile index rises with
    // the cell index, so the two opposite corners of the bilinear stencil
    // decide all four.
    covers(eastM, northM) {
      const i0 = Math.floor(eastM / 1000);
      const j0 = Math.floor(northM / 1000);
      return inWindow(i0, j0) && inWindow(i0 + 1, j0 + 1);
    },
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

/**
 * Open corridors by name under a world root, at most once each.
 *
 * Nine expeditions over one country grid would otherwise read the same
 * heightfield nine times, and at phase 2 that is ~70 GB of it.
 */
export function corridorCache(worldRoot: string): (name: string) => Corridor | null {
  const loaded = new Map<string, Corridor | null>();
  return (name) => {
    if (!loaded.has(name)) loaded.set(name, loadCorridor(join(worldRoot, name)));
    return loaded.get(name) ?? null;
  };
}

export interface Waypoint {
  readonly eastM: number;
  readonly northM: number;
}

export interface RouteMetrics {
  /** Distance from the start at which each leg ends, km. */
  readonly legEndKm: number[];
  readonly lengthKm: number;
}

export interface ProfiledRoute extends RouteMetrics {
  /** Ground elevation at one-kilometre intervals from the start. */
  readonly profileM: number[];
}

/**
 * Leg lengths from the projected waypoints alone.
 *
 * Split out from the sampling below because it is the half of a route a
 * machine with no built world can still work out for itself, and that is
 * exactly what lets a committed section be checked against the route it was
 * cut from: the ground has to be read off disk, the geometry does not.
 */
export function measureAlong(waypoints: readonly Waypoint[]): RouteMetrics {
  const legEndKm: number[] = [];
  let lengthKm = 0;
  for (let w = 0; w + 1 < waypoints.length; w++) {
    const from = waypoints[w]!;
    const to = waypoints[w + 1]!;
    lengthKm += Math.hypot(to.eastM - from.eastM, to.northM - from.northM) / 1000;
    legEndKm.push(lengthKm);
  }
  return { legEndKm, lengthKm };
}

/**
 * The point a given distance along the polyline.
 *
 * Indexed by absolute distance from the start rather than per leg, because
 * rounding each leg separately lets the profile drift a kilometre per corner
 * away from the distance the flight is measuring against - six corners into
 * Sea to Sky that is enough to read the wrong side of a ridge.
 */
export function pointAtKm(
  waypoints: readonly Waypoint[],
  metrics: RouteMetrics,
  km: number,
): Waypoint {
  const { legEndKm } = metrics;
  let leg = 0;
  while (leg + 1 < legEndKm.length && km > legEndKm[leg]!) leg++;
  const from = waypoints[leg]!;
  const to = waypoints[leg + 1]!;
  const legStartKm = leg === 0 ? 0 : legEndKm[leg - 1]!;
  const t = Math.min(1, (km - legStartKm) / (legEndKm[leg]! - legStartKm));
  return {
    eastM: from.eastM + (to.eastM - from.eastM) * t,
    northM: from.northM + (to.northM - from.northM) * t,
  };
}

/** Every kilometre station on a route, from 0 to its rounded-up length. */
export function stationsAlong(waypoints: readonly Waypoint[]): Waypoint[] {
  const metrics = measureAlong(waypoints);
  const stations: Waypoint[] = [];
  for (let km = 0; km <= Math.ceil(metrics.lengthKm); km++)
    stations.push(pointAtKm(waypoints, metrics, km));
  return stations;
}

/** Sample the ground under a polyline, one kilometre at a time. */
export function profileAlong(
  corridor: Corridor,
  waypoints: readonly Waypoint[],
): ProfiledRoute {
  const metrics = measureAlong(waypoints);
  return {
    ...metrics,
    profileM: stationsAlong(waypoints).map((p) => corridor.groundAt(p.eastM, p.northM)),
  };
}

/** The first kilometre station this corridor has no tiles under, or -1. */
export function firstUncoveredKm(
  corridor: Corridor,
  waypoints: readonly Waypoint[],
): number {
  return stationsAlong(waypoints).findIndex((p) => !corridor.covers(p.eastM, p.northM));
}
