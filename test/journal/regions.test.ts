/**
 * Which of the nine regions is the aircraft in? Nothing can answer that (F40).
 *
 * The journal's per-region counts, the GDD's "first discovery in each of the
 * nine regions unlocks that region's music", and a soft hint that names a
 * mountain range all need a position -> region map. The only one in the build
 * is the three-way stand-in that blends the air (D14's placeholder), and
 * these are the two measurements that say why it cannot be borrowed.
 *
 * No world needed: the ground is the committed section (D21).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REGIONS } from "../../content/schema.ts";
import { standInRegionWeights } from "../../engine/src/terrain/syntheticTiles.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const section = JSON.parse(
  readFileSync(join(root, "content", "sections", "sea-to-sky.json"), "utf8"),
) as { waypoints: { id: string; lat: number; lon: number }[]; legEndKm: number[]; groundM: number[] };

const points = section.waypoints.map((w) => projectAlbers(w.lat, w.lon));

/** Where the route is at a given kilometre, in projected metres. */
function at(km: number): { eastM: number; northM: number } {
  let left = km;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.eastM - a.eastM, b.northM - a.northM) / 1000;
    if (left <= len) {
      const t = len === 0 ? 0 : left / len;
      return {
        eastM: a.eastM + (b.eastM - a.eastM) * t,
        northM: a.northM + (b.northM - a.northM) * t,
      };
    }
    left -= len;
  }
  return points[points.length - 1]!;
}

describe("the stand-in region blend is not a region map", () => {
  it("knows three regions where the journal counts nine", () => {
    expect(standInRegionWeights(4000, 100)).toHaveLength(3);
    expect(REGIONS).toHaveLength(9);
  });

  it("gives the Sichuan Basin zero weight over every kilometre of Expedition 1", () => {
    // Including the 265 km from Chongqing to Chengdu, which is the Sichuan
    // Basin. The blend's basin term is an east coordinate band crossed with
    // low ground, and the route is never in both at once.
    let worst = 0;
    for (let km = 0; km < section.groundM.length; km++) {
      const { eastM } = at(km);
      worst = Math.max(worst, standInRegionWeights(eastM / 1000, section.groundM[km]!)[1]!);
    }
    expect(worst).toBe(0);
  });

  it("puts that band over the Hexi Corridor rather than over Sichuan", () => {
    // Evaluated at low ground, so only the east band decides. Chengdu and
    // Chongqing - the basin itself - are outside it; Golmud, Dunhuang and
    // Yumen, 800-1,200 km northwest, are inside.
    const weightAt = (lat: number, lon: number) =>
      standInRegionWeights(projectAlbers(lat, lon).eastM / 1000, 500)[1]!;
    expect(weightAt(30.66, 104.07)).toBe(0); // Chengdu
    expect(weightAt(29.56, 106.55)).toBe(0); // Chongqing
    expect(weightAt(36.42, 94.9)).toBeGreaterThan(0.9); // Golmud
    expect(weightAt(40.14, 94.66)).toBeGreaterThan(0.9); // Dunhuang
  });
});
