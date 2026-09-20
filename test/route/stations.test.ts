import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATIONS_VERSION, stationsFor } from "../../tools/stations.js";

/**
 * The capture stations (workstream B).
 *
 * These run on a machine with no built world, because the ground under the
 * route is committed as a section beside it (D21) and `resolveGround` reads
 * that when there is no corridor. So a fresh checkout can check that the
 * places a frame budget is measured at are still the places the route goes.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("capture stations", () => {
  const cut = stationsFor(root, "sea-to-sky");

  it("is cut from the route, in order, with the wall in it", () => {
    expect(cut.version).toBe(STATIONS_VERSION);
    const kms = cut.stations.map((s) => s.km);
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    const ids = cut.stations.map((s) => s.id);
    expect(ids).toContain("shanghai");
    expect(ids).toContain("lhasa");
    // The wall is the point of measuring anywhere other than the ends.
    expect(ids).toContain("wall-foot");
    expect(ids).toContain("wall-rim");
  });

  it("stays inside the route it was cut from", () => {
    for (const s of cut.stations) {
      expect(s.km).toBeGreaterThanOrEqual(0);
      expect(s.km).toBeLessThanOrEqual(cut.lengthKm);
    }
  });

  it("stands the camera above the ground, not in it", () => {
    // A station under the terrain would measure a frame no player ever sees,
    // and would do it without looking wrong in the table.
    for (const s of cut.stations) {
      expect(s.altitudeM).toBeGreaterThan(s.groundM);
    }
  });

  it("faces along the route, which is what decides what is in the frame", () => {
    // Sea to Sky runs east to west, so every heading has the aircraft losing
    // easting: `eastM += sin(headingRad)` must be negative the whole way.
    for (const s of cut.stations) {
      expect(Math.sin(s.headingRad)).toBeLessThan(0);
    }
    // And the last station cannot look past the end of the route.
    const last = cut.stations[cut.stations.length - 1]!;
    expect(Number.isFinite(last.headingRad)).toBe(true);
  });

  it("climbs the wall between its foot and its rim", () => {
    const foot = cut.stations.find((s) => s.id === "wall-foot")!;
    const rim = cut.stations.find((s) => s.id === "wall-rim")!;
    expect(rim.km).toBeGreaterThan(foot.km);
    expect(rim.groundM).toBeGreaterThan(foot.groundM + 1000);
  });
});
