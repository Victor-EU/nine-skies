import { describe, expect, it } from "vitest";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import { DEFAULT_HORIZON } from "../../engine/src/terrain/horizon.js";
import {
  HORIZON_FIELD_BYTES,
  HORIZON_FIELD_HEIGHT,
  HORIZON_FIELD_WIDTH,
} from "../../engine/src/terrain/worldGrid.js";
import { HorizonField, HORIZON_SAMPLE_KM } from "../../engine/src/terrain/horizonField.js";
import { HERO_TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import {
  HeroCover,
  type HeroIndex,
  type HeroManifest,
} from "../../engine/src/terrain/heroSource.js";

/**
 * Budget proxies (build plan, test and verification plan).
 *
 * CI does not measure frame rate - headless software rasterisation would give
 * a number that is precise and meaningless. It measures the things that make
 * frame rate regress, on a fixed route, and fails if they move. Real timings
 * come from the named floor device at milestones.
 */

const BUDGET = {
  drawCalls: 8,
  triangles: 1_200_000,
  residentTiles: 256,
  /** The horizon is meant to be nearly free. If it stops being, say so. */
  horizonTriangles: 16_384,
  // The shipped world budget's '<1 MB' line for the horizon field.
  horizonFieldBytes: 1024 * 1024,
};

/** Three points on the Sea to Sky corridor: coast, basin, plateau. */
const WAYPOINTS = [
  { name: "Shanghai coast", inlandKm: 120, northKm: 1500, altitudeM: 1200 },
  { name: "Sichuan Basin", inlandKm: 2760, northKm: 1500, altitudeM: 2100 },
  { name: "Tibetan Plateau", inlandKm: 3900, northKm: 1500, altitudeM: 5000 },
];

describe("terrain budget on the Sea to Sky corridor", () => {
  const terrain = new Terrain({
    scale: { ...DEFAULT_SCALE },
    viewRadiusTiles: 6,
    layers: 256,
  });

  it.each(WAYPOINTS)("$name stays inside budget", (wp) => {
    terrain.update(wp.inlandKm * 1000, wp.northKm * 1000, wp.altitudeM);
    const s = terrain.stats;
    expect(s.drawCalls).toBeLessThanOrEqual(BUDGET.drawCalls);
    expect(s.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    expect(s.resident).toBeLessThanOrEqual(BUDGET.residentTiles);
    expect(s.instances).toBeGreaterThan(0);
  });

  it("collapses the terrain to one draw call per LOD level", () => {
    terrain.update(3_900_000, 1_500_000, 5000);
    // The whole point of D4: tile count must not drive draw count.
    expect(terrain.stats.drawCalls).toBeLessThanOrEqual(4);
    expect(terrain.stats.instances).toBeGreaterThan(80);
  });

  it("never exceeds the texture array, however far the player flies", () => {
    for (let km = 100; km < 5000; km += 137) {
      terrain.update(km * 1000, 1_500_000, 3000);
      expect(terrain.stats.resident).toBeLessThanOrEqual(256);
    }
  });

  it("keeps the horizon impostor close to free", () => {
    // One draw call, added to the four above - still inside the draw budget.
    const triangles = DEFAULT_HORIZON.azimuths * 2 * DEFAULT_HORIZON.shells.length;
    expect(triangles).toBeLessThanOrEqual(BUDGET.horizonTriangles);
    expect(triangles).toBeLessThan(BUDGET.triangles / 100);

    // The stand-in world's field, and the real country-wide one the pipeline
    // ships. The second is the number the budget is actually about: the
    // prototype's 5,200 x 3,400 km fiction is smaller than China is.
    const standIn = new HorizonField(HORIZON_SAMPLE_KM);
    expect(standIn.byteLength).toBeLessThanOrEqual(BUDGET.horizonFieldBytes);
    expect(HORIZON_FIELD_BYTES).toBeLessThanOrEqual(BUDGET.horizonFieldBytes);
    expect(HORIZON_FIELD_WIDTH).toBe(841);
    expect(HORIZON_FIELD_HEIGHT).toBe(553);
  });

  it("reuses resident tiles instead of regenerating them", () => {
    terrain.update(1_000_000, 1_500_000, 2000);
    terrain.update(1_000_000, 1_500_000, 2000);
    expect(terrain.stats.generatedThisFrame).toBe(0);
  });
});

/**
 * What a hero area costs the frame (F51).
 *
 * Built synthetically rather than read from `dist-world/`, because the cost
 * is a function of tile count and LOD alone - the heights in them do not
 * change a single triangle - and this suite has to hold in CI, where there is
 * no world. Measured over the real Tiger Leaping Gorge cut at the same view
 * radius the app flies: 3 draws and 252k triangles for the country grid
 * alone, 5 draws and 712k with the gorge under the aeroplane.
 *
 * It is the largest single thing in the budget and it should be: 24 tiles of
 * 90 m ground the player is flying through is what the whole stage is for.
 * What this guards is that it stays one area's worth.
 */
const HERO_TILE_M = 11_520;
const HERO_STRIDE = HERO_TILE_SAMPLES * HERO_TILE_SAMPLES;

type Window = { hx0: number; hy0: number; hx1: number; hy1: number };
const ORIGIN = { originXM: -3_456_000, originYM: 1_792_000 };

/** A flat cover over these windows, which costs the frame what a real one does. */
function coverOf(...windows: Window[]): HeroCover {
  const areas = windows.map((window, i) => {
    const tiles = (window.hx1 - window.hx0) * (window.hy1 - window.hy0);
    const manifest = {
      version: 1,
      area: `budget-${i}`,
      name: `budget-${i}`,
      resolutionM: 90,
      tileM: HERO_TILE_M,
      tileSamples: HERO_TILE_SAMPLES,
      silhouetteBias: 0.4,
      window,
      origin: ORIGIN,
      countryTiles: [],
      holds: [],
      heights: { file: `budget-${i}.bin`, tiles, bytes: tiles * HERO_STRIDE * 2, sha256: "" },
      boundary: { unchecked: true },
      elevationM: { min: 0, max: 0 },
    } satisfies HeroManifest;
    return { manifest, heights: new Int16Array(tiles * HERO_STRIDE) };
  });
  const index: HeroIndex = {
    version: 1,
    resolutionM: 90,
    tileM: HERO_TILE_M,
    tileSamples: HERO_TILE_SAMPLES,
    origin: ORIGIN,
    areas: areas.map((a, i) => ({
      id: `budget-${i}`,
      name: `budget-${i}`,
      file: `budget-${i}.json`,
      window: a.manifest.window,
      bytes: 0,
    })),
  };
  return new HeroCover(index, areas);
}

/** The gorge's own shape: 4 x 6 tiles at (256, 89), and flat, which is free. */
function gorgeSizedCover(): HeroCover {
  return coverOf({ hx0: 256, hy0: 89, hx1: 260, hy1: 95 });
}

describe("what a 90 m hero area costs the frame", () => {
  const terrain = new Terrain({
    scale: { ...DEFAULT_SCALE },
    viewRadiusTiles: 6,
    layers: 256,
    hero: gorgeSizedCover(),
  });
  const eastM = 258 * HERO_TILE_M;
  const northM = 92 * HERO_TILE_M;

  it("stays inside the same budget the country grid is held to", () => {
    terrain.update(eastM, northM, 3000);
    const s = terrain.stats;
    expect(s.hero.areasDrawn).toBe(1);
    expect(s.hero.instances).toBe(24);
    expect(s.drawCalls).toBeLessThanOrEqual(BUDGET.drawCalls);
    expect(s.triangles).toBeLessThanOrEqual(BUDGET.triangles);
  });

  it("costs nothing at all where there is no cover", () => {
    // 1,000 km away: no hero instances, no hole, and the country grid draws
    // exactly what it drew before stage 6 existed.
    terrain.update(eastM + 1_000_000, northM, 3000);
    expect(terrain.stats.hero.instances).toBe(0);
    expect(terrain.stats.hero.triangles).toBe(0);
  });

  it("never exceeds its own texture array, which is sized to the cover", () => {
    for (let km = -200; km <= 200; km += 37) {
      terrain.update(eastM + km * 1000, northM, 3000);
      expect(terrain.stats.hero.resident).toBeLessThanOrEqual(24);
    }
  });
});

/**
 * Two areas, which is what the cover holds from F52 on.
 *
 * The rule an area is drawn by is a distance to its rectangle, and the reach
 * is `viewRadiusTiles` *country* tiles -- 384 km at the six the app flies
 * with. So two areas within a few hundred kilometres of each other are one
 * area as far as a frame is concerned, and that is the number the Three
 * Gorges were sized against: three separate areas down that reach would have
 * cost the same frame as one and crossed the rim four more times (F51, F52).
 */
describe("a second hero area", () => {
  const NEAR = { hx0: 256, hy0: 89, hx1: 260, hy1: 95 };
  const eastM = 258 * HERO_TILE_M;
  const northM = 92 * HERO_TILE_M;
  /** Twelve by three, the Three Gorges' own shape, 300 km east. */
  const beside = (gapTiles: number) => ({
    hx0: 260 + gapTiles,
    hy0: 89,
    hx1: 272 + gapTiles,
    hy1: 92,
  });

  const flyWith = (...windows: { hx0: number; hy0: number; hx1: number; hy1: number }[]) => {
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 6,
      layers: 256,
      hero: coverOf(...windows),
    });
    terrain.update(eastM, northM, 3000);
    return terrain;
  };

  it("draws both when both are in reach, and cuts both holes", () => {
    const terrain = flyWith(NEAR, beside(10));
    expect(terrain.stats.hero.areasDrawn).toBe(2);
    expect(terrain.stats.hero.instances).toBe(24 + 36);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(2);
  });

  it("still fits the budget the country grid alone is held to", () => {
    const s = flyWith(NEAR, beside(10)).stats;
    expect(s.drawCalls).toBeLessThanOrEqual(BUDGET.drawCalls);
    expect(s.triangles).toBeLessThanOrEqual(BUDGET.triangles);
  });

  it("stops drawing the far one past the view radius, and stops cutting it", () => {
    // 384 km of reach: 33 hero tiles of 11.52 km. A hole nobody fills is the
    // one thing this must never do, so the cut count has to fall with it.
    const inside = flyWith(NEAR, beside(30));
    expect(inside.stats.hero.areasDrawn).toBe(2);
    const outside = flyWith(NEAR, beside(40));
    expect(outside.stats.hero.areasDrawn).toBe(1);
    expect(outside.material.uniforms.uCutCount!.value).toBe(1);
    expect(outside.stats.hero.instances).toBe(24);
  });

  it("refuses a cover it cannot hold in one texture array", () => {
    // Every published tile is a layer, because an area is drawn whole and so
    // nothing is ever evicted. WebGL2 guarantees 256 layers: eight areas of
    // the Three Gorges' size would be 288, and this is where that is said
    // rather than at upload (F52).
    const wide = Array.from({ length: 8 }, (_, i) => ({
      hx0: 256 + i * 13,
      hy0: 89,
      hx1: 268 + i * 13,
      hy1: 92,
    }));
    expect(() => coverOf(...wide)).not.toThrow();
    expect(
      () =>
        new Terrain({
          scale: { ...DEFAULT_SCALE },
          viewRadiusTiles: 6,
          layers: 256,
          hero: coverOf(...wide),
        }),
    ).toThrow(/288 tiles/);
  });
});
