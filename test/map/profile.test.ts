/**
 * What the map's elevation profile has to survive (F42).
 *
 * The GDD asks for *a live elevation profile sampled from the resident tile
 * cache over the last 200 km*. Three things about that sentence are worth
 * pinning: that the cache really does reach 200 km, what 200 km is worth in
 * minutes, and what the ground does inside it.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODE_GROUND_KM_PER_MIN } from "../../engine/src/sim/scale.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { TRACK_WINDOW_KM } from "../../engine/src/map/track.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";

/** What `app/src/main.ts` asks the terrain for. */
const VIEW_RADIUS_TILES = 6;

const section = JSON.parse(
  readFileSync(join("content", "sections", "sea-to-sky.json"), "utf8"),
) as { waypoints: { lat: number; lon: number }[]; groundM: number[] };

describe("the resident cache reaches further than the window", () => {
  it("keeps 384 km of ground in memory, in every direction", () => {
    // The terrain makes a *disc* resident, not a cone, and re-makes it every
    // frame - so everything within the radius is the most recently used and
    // is never the layer an insert evicts. The window is inside it by 184 km.
    const reachKm = VIEW_RADIUS_TILES * TILE_KM;
    expect(reachKm).toBe(384);
    expect(reachKm).toBeGreaterThan(TRACK_WINDOW_KM);
  });
});

describe("200 km is a different amount of flying in each mode", () => {
  it("runs from 46 seconds to nine minutes", () => {
    const minutes = (mode: keyof typeof MODE_GROUND_KM_PER_MIN) =>
      TRACK_WINDOW_KM / MODE_GROUND_KM_PER_MIN[mode];
    expect(minutes("boost")).toBeCloseTo(0.77, 2);
    expect(minutes("cruise")).toBeCloseTo(1.54, 2);
    expect(minutes("low")).toBeCloseTo(4.62, 2);
    expect(minutes("approach")).toBeCloseTo(9.23, 2);
    expect(minutes("approach") / minutes("boost")).toBeCloseTo(12, 0);
  });
});

describe("and the ground inside it is not the same kind of ground", () => {
  it("holds 57 m of relief over the plain and 4,464 m through the Hengduan", () => {
    const g = section.groundM;
    let flattest = Infinity;
    let roughest = 0;
    for (let km = TRACK_WINDOW_KM; km < g.length; km++) {
      const w = g.slice(km - TRACK_WINDOW_KM, km);
      const relief = Math.max(...w) - Math.min(...w);
      flattest = Math.min(flattest, relief);
      roughest = Math.max(roughest, relief);
    }
    expect(flattest).toBeCloseTo(57, 0);
    expect(roughest).toBeCloseTo(4464, 0);
    // Seventy-eight times. An axis fitted to the window would draw the first
    // at the full height of the widget (F14's mistake, a new instrument).
    expect(roughest / flattest).toBeGreaterThan(70);
  });
});

const worldDir = join("dist-world", "sea-to-sky");
const hasWorld = existsSync(join(worldDir, "horizon.bin"));

describe.skipIf(!hasWorld)("the horizon field is the map's picture, not its profile", () => {
  it("reads high, because a silhouette is a maximum", () => {
    const manifest = JSON.parse(readFileSync(join(worldDir, "manifest.json"), "utf8"));
    const buf = readFileSync(join(worldDir, "horizon.bin"));
    const field = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    const { width, height, sampleKm } = manifest.horizon;

    const pts = section.waypoints.map((w) => projectAlbers(w.lat, w.lon));
    const at = (km: number) => {
      let left = km;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
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
      return pts[pts.length - 1]!;
    };

    let sum = 0;
    let worst = 0;
    let high = 0;
    for (let km = 0; km < section.groundM.length; km++) {
      const p = at(km);
      const x = Math.round(p.eastM / 1000 / sampleKm);
      const y = Math.round(p.northM / 1000 / sampleKm);
      const h = x < 0 || y < 0 || x >= width || y >= height ? 0 : field[y * width + x]!;
      const d = h - section.groundM[km]!;
      sum += Math.abs(d);
      if (d > 0) high++;
      if (Math.abs(d) > Math.abs(worst)) worst = d;
    }
    const n = section.groundM.length;
    // The field is biased 0.6 toward the cell maximum on purpose (D15), so a
    // distant ridge keeps its crest. That is right for the wall ahead and
    // wrong for the ground just flown over: it reads high nearly everywhere,
    // by 229 m on average and 1.8 km at worst.
    expect(sum / n).toBeGreaterThan(150);
    expect(worst).toBeGreaterThan(1500);
    expect(high / n).toBeGreaterThan(0.85);
  });
});
