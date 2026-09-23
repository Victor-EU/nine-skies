/**
 * Stage 4's done criterion: each scene pack holds every tile its rail can
 * stream (plan v2). Flown, not computed: the real rail flight is driven the
 * way a viewer can drive it - held hard left, hard right, weaving, fastest,
 * slowest, left alone - for the whole flight, and at every frame the tiles
 * the terrain would ask for are checked against the committed pack index.
 * No world and no GPU: the index says which tiles each pack answers for.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_RAIL, RailFlight, type RailInput } from "../../engine/src/film/rail.js";
import { DEFAULT_REACH, tileKey } from "../../engine/src/film/reach.js";
import { buildRail } from "../../engine/src/film/scene.js";
import { FLIGHT_S } from "../../engine/src/film/timeline.js";
import { VIEW_RADIUS_TILES } from "../../engine/src/terrain/terrain.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { tilesInView } from "../../engine/src/terrain/view.js";
import { loadFilm } from "../../tools/film.ts";

interface PackIndex {
  viewRadiusTiles: number;
  tileM: number;
  speedMax: number;
  maxOffsetM: number;
  flightS: number;
  budgetBytes: number;
  totalBytes: number;
  scenes: { id: string; tiles: number[]; hero: { area: string } | null }[];
}

const index = JSON.parse(readFileSync("app/public/packs/index.json", "utf8")) as PackIndex;
const { film } = loadFilm();

/** Ways to fly a scene, each a function of the flight's second. */
const pilots: Record<string, (t: number) => RailInput> = {
  "left alone": () => ({ speed: 0, heading: 0, auto: false }),
  // The farthest along the rail anyone gets: steering costs progress.
  "straight, fastest": () => ({ speed: 1, heading: 0, auto: false }),
  // And the farthest to one side of that.
  "straight, fastest, then hard left": (t) => ({ speed: 1, heading: t > FLIGHT_S - 30 ? -1 : 0, auto: false }),
  "straight, fastest, then hard right": (t) => ({ speed: 1, heading: t > FLIGHT_S - 30 ? 1 : 0, auto: false }),
  "hard left, fastest": () => ({ speed: 1, heading: -1, auto: false }),
  "hard right, fastest": () => ({ speed: 1, heading: 1, auto: false }),
  "weaving, fastest": (t) => ({ speed: 1, heading: Math.sin(t / 6) > 0 ? 1 : -1, auto: false }),
  "hard left, slowest": () => ({ speed: -1, heading: -1, auto: false }),
};

describe("the scene packs", () => {
  it("were cut for the engine and the rail flight as they are", () => {
    expect(index.viewRadiusTiles).toBe(VIEW_RADIUS_TILES);
    expect(index.tileM).toBe(TILE_KM * 1000);
    expect(index.speedMax).toBe(DEFAULT_RAIL.speedMax);
    expect(index.maxOffsetM).toBe(DEFAULT_RAIL.maxOffsetM);
    expect(index.flightS).toBe(FLIGHT_S);
    expect(DEFAULT_REACH.speedMax).toBe(DEFAULT_RAIL.speedMax);
  });

  it("are one a scene, in the film's order, each with its scene's hero", () => {
    expect(index.scenes.map((s) => s.id)).toEqual(film.scenes.map((s) => s.id));
    for (const [i, s] of film.scenes.entries()) expect(index.scenes[i]!.hero?.area ?? null).toBe(s.hero);
  });

  it("are the whole film inside its budget", () => {
    expect(index.totalBytes).toBeLessThanOrEqual(index.budgetBytes);
    expect(index.budgetBytes).toBe(30_000_000);
  });

  for (const [i, scene] of film.scenes.entries()) {
    it(`hold every tile the ${scene.id} camera can ask for, however it is flown`, () => {
      const packed = new Set<number>();
      const flat = index.scenes[i]!.tiles;
      for (let k = 0; k < flat.length; k += 2) packed.add(tileKey(flat[k]!, flat[k + 1]!));
      const rail = buildRail(scene.rail);
      const tileM = TILE_KM * 1000;
      const dt = 1 / 20;
      for (const [name, pilot] of Object.entries(pilots)) {
        const flight = new RailFlight(rail, { corridorRad: (scene.corridorDeg * Math.PI) / 180 });
        const missing = new Set<number>();
        for (let t = 0; t <= FLIGHT_S; t += dt) {
          const s = flight.update(pilot(t), dt);
          const cx = Math.floor(s.eastM / tileM);
          const cy = Math.floor(s.northM / tileM);
          for (const [tx, ty] of tilesInView(cx, cy, VIEW_RADIUS_TILES)) {
            const key = tileKey(tx, ty);
            if (!packed.has(key)) missing.add(key);
          }
        }
        expect(missing.size, `${name}: ${missing.size} tiles outside the pack`).toBe(0);
      }
    });
  }
});
