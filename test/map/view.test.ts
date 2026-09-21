/**
 * The map's transform, and the one rule in it (F42).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEIHE_TENGCHONG, MapView } from "../../engine/src/map/view.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";

const bounds = { eastM0: 0, northM0: 0, eastM1: 4_000_000, northM1: 1_000_000 };

describe("MapView", () => {
  it("never stretches, because the projection is equal-area", () => {
    // D1: "honest scale" is an equal-area claim. A map that fitted a 4:1
    // window into a square widget by scaling each axis on its own would throw
    // that away on the one surface where two provinces are visible at once.
    const view = new MapView(bounds, 800, 800);
    const a = view.project(0, 0);
    const b = view.project(1_000_000, 0);
    const c = view.project(0, 1_000_000);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(c.y - a.y), 6);
  });

  it("letterboxes the short axis and fills the long one", () => {
    const view = new MapView(bounds, 800, 800);
    expect(view.scale).toBeCloseTo(800 / 4_000_000, 12);
    expect(view.offsetX).toBeCloseTo(0, 6);
    expect(view.offsetY).toBeCloseTo((800 - 1_000_000 * view.scale) / 2, 6);
  });

  it("puts north up", () => {
    const view = new MapView(bounds, 800, 800);
    expect(view.project(0, 1_000_000).y).toBeLessThan(view.project(0, 0).y);
  });

  it("reports the kilometres a pixel is worth, for a scale bar that is not a guess", () => {
    const view = new MapView(bounds, 800, 800);
    expect(view.kmPerPx).toBeCloseTo(4000 / 800, 9);
  });

  it("honours the padding on both sides", () => {
    const view = new MapView(bounds, 800, 400, 20);
    expect(view.project(0, 0).x).toBeGreaterThanOrEqual(20);
    expect(view.project(4_000_000, 0).x).toBeLessThanOrEqual(780);
  });
});

describe("the Heihe-Tengchong line", () => {
  it("uses the endpoints the equal-area probe is measured against", () => {
    // The map draws the line and the pipeline checks the 57/43 land split
    // across it. Two copies of two coordinates, so this reads the pipeline's.
    const probes = readFileSync("pipeline/nineskies/probes.py", "utf8");
    const north = /north_end:\s*tuple\[float,\s*float\]\s*=\s*\(([\d.]+),\s*([\d.]+)\)/.exec(probes);
    const south = /south_end:\s*tuple\[float,\s*float\]\s*=\s*\(([\d.]+),\s*([\d.]+)\)/.exec(probes);
    expect(north, "north_end not found in probes.py").not.toBeNull();
    expect(south, "south_end not found in probes.py").not.toBeNull();
    expect(Number(north![1])).toBeCloseTo(HEIHE_TENGCHONG.north.latDeg, 6);
    expect(Number(north![2])).toBeCloseTo(HEIHE_TENGCHONG.north.lonDeg, 6);
    expect(Number(south![1])).toBeCloseTo(HEIHE_TENGCHONG.south.latDeg, 6);
    expect(Number(south![2])).toBeCloseTo(HEIHE_TENGCHONG.south.lonDeg, 6);
    expect(/expected_west_pct=57\.0/.test(probes)).toBe(true);
    expect(HEIHE_TENGCHONG.westPct).toBe(57);
  });

  it("runs northeast to southwest across the country", () => {
    const n = projectAlbers(HEIHE_TENGCHONG.north.latDeg, HEIHE_TENGCHONG.north.lonDeg);
    const s = projectAlbers(HEIHE_TENGCHONG.south.latDeg, HEIHE_TENGCHONG.south.lonDeg);
    expect(n.eastM).toBeGreaterThan(s.eastM);
    expect(n.northM).toBeGreaterThan(s.northM);
    // About 3,000 km of diagonal.
    expect(Math.hypot(n.eastM - s.eastM, n.northM - s.northM) / 1000).toBeGreaterThan(2500);
  });
});
