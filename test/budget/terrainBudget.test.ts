import { describe, expect, it } from "vitest";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import { DEFAULT_HORIZON } from "../../engine/src/terrain/horizon.js";
import { HorizonField, HORIZON_SAMPLE_KM } from "../../engine/src/terrain/horizonField.js";

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
  horizonFieldBytes: 700 * 1024,
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

    const field = new HorizonField(HORIZON_SAMPLE_KM);
    expect(field.byteLength).toBeLessThanOrEqual(BUDGET.horizonFieldBytes);
  });

  it("reuses resident tiles instead of regenerating them", () => {
    terrain.update(1_000_000, 1_500_000, 2000);
    terrain.update(1_000_000, 1_500_000, 2000);
    expect(terrain.stats.generatedThisFrame).toBe(0);
  });
});
