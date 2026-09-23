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
import type { HeroCover } from "../engine/src/terrain/heroSource.ts";
import { WorldCoverage, type CoverageRecord } from "../engine/src/terrain/coverage.ts";
import { loadHeroCoversFrom } from "./heroCover.ts";

const TILE_SAMPLES = 65;
const TILE_CELLS = TILE_SAMPLES - 1;

export interface CorridorManifest {
  readonly corridor: string;
  readonly resolutionM: number;
  readonly window: { tx0: number; ty0: number; tx1: number; ty1: number };
  readonly anchors: Record<string, { lat: number; lon: number; eastM: number; northM: number }>;
  readonly start: { eastM: number; northM: number; altitudeM: number; headingRad: number };
  readonly heights: { tiles: number; sha256: string };
  /** What the source reached under each tile (D53, F54); absent before it. */
  readonly coverage?: CoverageRecord;
  /**
   * The source rasters this world was built from (D24), or `unrecorded: true`
   * for a world built before they were.
   */
  readonly source?: { bucket?: string; tiles?: number; sha256?: string; unrecorded?: boolean };
  /**
   * What stage 3 carved this world with (F61): the Natural Earth rivers and
   * lakes by their recorded digests, the rule for the other basins, and one
   * digest over all of it. Absent for a world built before stage 3 ran.
   */
  readonly conditioning?: { rule?: string; radiusCells?: number; sha256?: string };
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
  /**
   * The 90 m cover published beside this corridor (stage 6), or null.
   *
   * It is here rather than opened separately because a corridor build emits
   * both and the two are one answer to "what was built": a tool that reads
   * `heights.bin` and never looks in `hero/` is reading a surface the game
   * stopped drawing the day an area was cut over it (F53).
   */
  /** The first hero cover, for anything that names one; `heroes` is all of them. */
  readonly hero: HeroCover | null;
  readonly heroes: readonly HeroCover[];
  /** The hero ground here, from whichever cover holds it, or null off every cover. */
  heroGroundAt(eastM: number, northM: number): number | null;
  /**
   * The ground the *game* draws at a point -- the hero grid where there is
   * one, the country grid everywhere else.
   *
   * This is `Terrain.groundElevationM`'s rule, and deliberately not
   * `groundAt`. Sections and patches are cut from `groundAt`, because every
   * committed artefact in this repository was, and changing that invalidates
   * all of them at once (D23, D24) -- a decision rather than a fix. What
   * `drawnAt` is for is *noticing*: the cockpit and the content gate now read
   * different surfaces, and through Tiger Leaping Gorge they differ by more
   * than the clearance any route is checked to keep.
   */
  drawnAt(eastM: number, northM: number): number;
  /**
   * What the source had under each tile (F54), or null on a world built
   * before the record existed.
   *
   * `covers` answers whether a *tile* was published, which is not the same
   * question: the window is a rectangle around a lon/lat box and its corners
   * are published tiles full of zeros that no raster was ever fetched for.
   * 296 of this corridor's 1,155 are like that.
   */
  readonly coverage: WorldCoverage | null;
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

  const heroes = loadHeroCoversFrom(dir);
  const heroGroundAt = (eastM: number, northM: number): number | null => {
    for (const h of heroes) {
      const g = h.groundAt(eastM, northM);
      if (g !== null) return g;
    }
    return null;
  };

  const corridor: Corridor = {
    manifest,
    hero: heroes[0] ?? null,
    heroes,
    heroGroundAt,
    coverage: WorldCoverage.from(manifest),
    heightsSha256: createHash("sha256").update(bytes).digest("hex"),
    sampleAtKm: (i, j) => (inWindow(i, j) ? sampleAt(i, j) : null),
    drawnAt: (eastM, northM) => heroGroundAt(eastM, northM) ?? corridor.groundAt(eastM, northM),
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
  return corridor;
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

/**
 * How far the ground a check reads is from the ground the game draws.
 *
 * Every committed section and patch is cut from the 1 km country grid, and
 * since stage 6 the game does not always draw that grid: over a hero area it
 * draws 90 m ground instead, and `Terrain.groundElevationM` answers off
 * whichever is on screen. So a route or a challenge over a hero area is
 * checked against a surface the player never flies. Nothing authored is over
 * one today -- this is what says so, and keeps saying it (F53).
 *
 * `over` is the count that matters: zero is the pass, and it is only a real
 * pass when `cover` names something. A world built before stage 6 has no
 * second grid to disagree with and reports zero for that reason instead,
 * which is a different sentence and must not read as the same one.
 */
export interface DrawnGap {
  /** The 90 m cover published beside this world, or null if there is none. */
  readonly cover: string | null;
  /** Points asked about, and how many of them the game draws at 90 m. */
  readonly of: number;
  readonly over: number;
  /** Area ids met, in the order the points meet them. */
  readonly areas: readonly string[];
  /** The worst the two grids disagree across those points, metres. */
  readonly worstM: number;
  /** Which point that was: an index into the list given. */
  readonly worstAt: number;
  readonly countryM: number;
  readonly heroM: number;
}

export function drawnGap(corridor: Corridor, points: readonly Waypoint[]): DrawnGap {
  const hero = corridor.hero;
  const areas: string[] = [];
  let over = 0;
  let worstM = 0;
  let worstAt = -1;
  let countryM = 0;
  let heroM = 0;

  if (hero !== null) {
    points.forEach((p, i) => {
      const fine = hero.groundAt(p.eastM, p.northM);
      if (fine === null) return;
      over++;
      const area = hero.areaAt(p.eastM, p.northM);
      if (area !== null && !areas.includes(area)) areas.push(area);
      const coarse = corridor.groundAt(p.eastM, p.northM);
      if (Math.abs(coarse - fine) > worstM) {
        worstM = Math.abs(coarse - fine);
        worstAt = i;
        countryM = coarse;
        heroM = fine;
      }
    });
  }

  return {
    cover: hero?.label ?? null,
    of: points.length,
    over,
    areas,
    worstM,
    worstAt,
    countryM,
    heroM,
  };
}

/**
 * Zeros the pipeline cannot vouch for.
 *
 * `covers` cannot catch these and was never meant to. A corridor window is the
 * bounding rectangle of a curved quadrilateral, so tiles along its edge are
 * published, inside the window, and partly made of samples no raster ever
 * reached - and a route across one of those samples is flown over sea level
 * and clears everything above it. That is F44's failure a stage earlier:
 * silent, and green. Measured on a route out to the window's north-west
 * corner, one station reads 0 m where the plateau around it reads 3,900 to
 * 5,100.
 *
 * **Both halves of the test are needed and neither is enough.** The tile
 * record is 64 km and says a tile is partly unfetched, not which samples
 * are - on that route 1,166 of 1,167 stations over such tiles are over real
 * ground. The elevation alone cannot say either, because zero is a real
 * elevation over most of the east of this corridor. Together they are exact
 * for the purpose: a zero inside a tile the source only partly reached is a
 * zero nothing published stands behind.
 *
 * `d` and `o` tiles are excluded because their zeros *are* vouched for -
 * fetched ground at sea level in the first, open ocean in the second.
 *
 * `recorded` is the difference between "none found" and "nothing to look at":
 * a world built before F54 reports zero for the second reason.
 */
export interface UnvouchedGround {
  readonly recorded: boolean;
  readonly of: number;
  readonly over: number;
  /** Index of the first such point in the list given, or -1. */
  readonly firstAt: number;
}

export function unvouchedGround(
  corridor: Corridor,
  points: readonly Waypoint[],
): UnvouchedGround {
  const cover = corridor.coverage;
  if (cover === null) return { recorded: false, of: points.length, over: 0, firstAt: -1 };
  let over = 0;
  let firstAt = -1;
  points.forEach((p, i) => {
    const state = cover.at(p.eastM, p.northM);
    if (state === "data" || state === "ocean") return;
    if (corridor.groundAt(p.eastM, p.northM) !== 0) return;
    over++;
    if (firstAt < 0) firstAt = i;
  });
  return { recorded: true, of: points.length, over, firstAt };
}

/** The first kilometre station this corridor has no tiles under, or -1. */
export function firstUncoveredKm(
  corridor: Corridor,
  waypoints: readonly Waypoint[],
): number {
  return stationsAlong(waypoints).findIndex((p) => !corridor.covers(p.eastM, p.northM));
}
