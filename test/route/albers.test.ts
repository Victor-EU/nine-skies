/**
 * The TypeScript projection against PROJ's own answer.
 *
 * `projectAlbers` is a second implementation of the projection the pipeline
 * owns, and it exists because content is authored in degrees, the simulation
 * flies in metres, and a browser has no PROJ in it. Two implementations of
 * one projection is exactly the kind of duplication that drifts, so this
 * compares them on real points rather than trusting either.
 *
 * The points come from `pipeline/reference/albers.json`, which PROJ writes
 * and `pipeline/tests/test_reference.py` keeps current. Reading a file out of
 * `pipeline/` is deliberate: the pipeline is the only thing in the repository
 * that owns a projection, so it publishes one and the engine checks itself
 * against what it published. Before that file existed this suite read the
 * anchors out of a built manifest and skipped on a fresh clone, which is the
 * gap F24 left open and F25 closed - every assertion here now runs on every
 * commit, with no world and no Python.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadCorridor } from "../../tools/corridor.ts";
import { ORIGIN_X_M, ORIGIN_Y_M, projectAlbers } from "../../engine/src/terrain/worldGrid.js";

interface ReferencePoint {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly eastM: number;
  readonly northM: number;
}

interface ReferenceTable {
  readonly version: number;
  readonly proj4: string;
  readonly originXM: number;
  readonly originYM: number;
  readonly toleranceM: number;
  readonly points: readonly ReferencePoint[];
}

const table = JSON.parse(
  readFileSync("pipeline/reference/albers.json", "utf8"),
) as ReferenceTable;

describe("projectAlbers", () => {
  it("lands on PROJ's answer at every point in the table", () => {
    for (const p of table.points) {
      const ours = projectAlbers(p.lat, p.lon);
      expect(Math.abs(ours.eastM - p.eastM), `${p.name} east`).toBeLessThan(table.toleranceM);
      expect(Math.abs(ours.northM - p.northM), `${p.name} north`).toBeLessThan(table.toleranceM);
    }
  });

  it("is checked where a projection actually goes wrong", () => {
    // A table of seven places along one corridor would pass while saying
    // almost nothing. Both standard parallels, the central meridian and the
    // corners of the country are where the cone's error changes sign or is
    // largest, so the table has to contain them for the check above to mean
    // anything.
    const lats = new Set(table.points.map((p) => p.lat));
    const lons = new Set(table.points.map((p) => p.lon));
    expect(table.points.length).toBeGreaterThanOrEqual(40);
    expect(lats.has(25)).toBe(true);
    expect(lats.has(47)).toBe(true);
    expect(lons.has(105)).toBe(true);
    expect(Math.max(...lons) - Math.min(...lons)).toBeGreaterThan(60);
  });

  it("shares an origin with the grid that wrote the table", () => {
    // The engine's copy of the origin is what turns PROJ's metres into the
    // world's. If these ever part company every anchor is out by the
    // difference and nothing else notices.
    expect(ORIGIN_X_M).toBe(table.originXM);
    expect(ORIGIN_Y_M).toBe(table.originYM);
    expect(table.proj4).toContain("+proj=aea");
    expect(table.proj4).toContain("+lon_0=105");
  });

  it("puts the central meridian where the projection says it is", () => {
    // On 105 E the cone's axis is due north, so easting depends on nothing
    // but the origin offset. A spherical-earth slip would not show here,
    // which is why the table check above is the one that matters.
    const onMeridian = projectAlbers(35, 105);
    expect(onMeridian.eastM).toBeCloseTo(-ORIGIN_X_M, 6);
    expect(ORIGIN_Y_M).toBe(1_792_000);
  });

  it("is ellipsoidal, not spherical", () => {
    // If someone simplifies the authalic function away for a sphere of
    // radius 6,371 km, this catches it. PROJ puts 40 N on the central
    // meridian at 4,299,860 m north of the equator; the spherical form puts
    // it at 4,316,732, which is 16.9 km - seventeen tiles - of quiet wrong.
    const p = projectAlbers(40, 105);
    expect(p.northM + ORIGIN_Y_M).toBeCloseTo(4_299_860, 0);
  });
});

const corridor = loadCorridor("dist-world/sea-to-sky");

describe.skipIf(corridor === null)("the table against a built world", () => {
  it("agrees with the anchors the manifest was written with", () => {
    // A third path to the same numbers, and the one that would catch a table
    // regenerated with constants the built world does not share.
    const byName = new Map(table.points.map((p) => [p.name, p]));
    const anchors = Object.entries(corridor!.manifest.anchors);
    expect(anchors.length).toBeGreaterThan(4);
    for (const [name, a] of anchors) {
      const p = byName.get(name);
      expect(p, `${name} is in the reference table`).toBeDefined();
      expect(Math.abs(p!.eastM - a.eastM), `${name} east`).toBeLessThan(table.toleranceM);
      expect(Math.abs(p!.northM - a.northM), `${name} north`).toBeLessThan(table.toleranceM);
    }
  });
});
